from pathlib import Path
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.config import settings
from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import get_current_user, require_activated_candidate, require_admin
from app.models.candidate import CandidateProfile
from app.models.user import User
from app.services.resume_parser import parse_resume

router = APIRouter(prefix="/candidates", tags=["candidates"])


class CandidateCreateRequest(BaseModel):
    full_name: str
    phone: str | None = None
    location: str | None = None
    skills: list[str] | None = None
    experience: list[dict] | None = None
    education: list[dict] | None = None
    resume_url: str | None = None
    bio: str | None = None


class CandidateUpdateRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    location: str | None = None
    skills: list[str] | None = None
    experience: list[dict] | None = None
    education: list[dict] | None = None
    resume_url: str | None = None
    bio: str | None = None


class CandidateResponse(BaseModel):
    id: UUID
    user_id: UUID
    full_name: str
    phone: str | None
    location: str | None
    skills: list | None
    experience: list | None
    education: list | None
    resume_url: str | None
    bio: str | None
    auto_apply_enabled: bool
    auto_apply_allowed: bool

    model_config = {"from_attributes": True}

    @field_validator("skills", "experience", "education", mode="before")
    @classmethod
    def _as_list(cls, value: object) -> object:
        if value is None or isinstance(value, list):
            return value
        return []


JSON_PROFILE_FIELDS = {"skills", "experience", "education"}


def _apply_updates(profile: CandidateProfile, update_data: dict) -> None:
    update_data.pop("auto_apply_enabled", None)
    update_data.pop("auto_apply_allowed", None)
    for key, value in update_data.items():
        setattr(profile, key, value)
        if key in JSON_PROFILE_FIELDS:
            flag_modified(profile, key)


async def _get_candidate_profile(
    db: AsyncSession, user: User
) -> CandidateProfile | None:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user.id)
    )
    return result.scalar_one_or_none()


@router.get("/", response_model=list[CandidateResponse])
async def list_candidates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[CandidateProfile]:
    if current_user.role == "admin":
        result = await db.execute(select(CandidateProfile))
        return list(result.scalars().all())

    profile = await _get_candidate_profile(db, current_user)
    if profile is None:
        profile = await get_or_create_candidate_profile(db, current_user)
    return [profile]


@router.get("/me", response_model=CandidateResponse)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    if current_user.role != "candidate":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate profile only")
    return await get_or_create_candidate_profile(db, current_user)


@router.put("/me", response_model=CandidateResponse)
async def update_my_profile(
    body: CandidateUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    if current_user.role != "candidate":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Candidate profile only")
    profile = await get_or_create_candidate_profile(db, current_user)
    _apply_updates(profile, body.model_dump(exclude_unset=True))
    await db.flush()
    await db.commit()
    await db.refresh(profile)
    return profile


@router.post("/", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    body: CandidateCreateRequest,
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    existing = await _get_candidate_profile(db, current_user)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Profile already exists"
        )

    profile = CandidateProfile(
        user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


@router.get("/{candidate_id}", response_model=CandidateResponse)
async def get_candidate(
    candidate_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    if current_user.role != "admin" and profile.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    if current_user.role != "admin" and current_user.account_status == "pending":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is not activated. Enter your invite code to continue.",
        )

    return profile


@router.put("/{candidate_id}", response_model=CandidateResponse)
async def update_candidate(
    candidate_id: UUID,
    body: CandidateUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    if current_user.role != "admin" and profile.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    _apply_updates(profile, body.model_dump(exclude_unset=True))
    await db.flush()
    await db.commit()
    await db.refresh(profile)
    return profile


ALLOWED_RESUME_EXTENSIONS = {".pdf", ".doc", ".docx"}
MAX_RESUME_BYTES = 10 * 1024 * 1024


@router.post("/{candidate_id}/resume", response_model=CandidateResponse)
async def upload_resume(
    candidate_id: UUID,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        profile = await get_or_create_candidate_profile(db, current_user)
    if current_user.role != "admin" and profile.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_RESUME_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume must be a PDF, DOC, or DOCX file",
        )

    content = await file.read()
    if len(content) > MAX_RESUME_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Resume must be 10MB or smaller",
        )

    resume_dir = Path(settings.UPLOAD_DIR) / "resumes"
    resume_dir.mkdir(parents=True, exist_ok=True)
    dest = resume_dir / f"{profile.id}{suffix}"
    dest.write_bytes(content)
    profile.resume_url = str(dest)

    try:
        parsed = parse_resume(file.filename or dest.name, content)
    except Exception:
        parsed = {}

    _apply_parsed_profile(profile, parsed)

    await db.flush()
    await db.refresh(profile)
    return profile


def _apply_parsed_profile(profile: CandidateProfile, parsed: dict) -> None:
    if not parsed:
        return

    for field in ("full_name", "phone", "location", "bio"):
        value = (parsed.get(field) or "").strip()
        if value:
            setattr(profile, field, value)

    parsed_skills = [s for s in (parsed.get("skills") or []) if isinstance(s, str) and s.strip()]
    if parsed_skills:
        existing = profile.skills if isinstance(profile.skills, list) else []
        merged: list[str] = []
        for skill in [*existing, *parsed_skills]:
            if skill not in merged:
                merged.append(skill)
        profile.skills = merged

    if parsed.get("experience"):
        profile.experience = parsed["experience"]
    if parsed.get("education"):
        profile.education = parsed["education"]


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate(
    candidate_id: UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> None:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    await db.delete(profile)
