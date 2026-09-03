from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import require_activated_candidate
from app.models.candidate import CandidateProfile
from app.models.preference import JobPreference
from app.models.user import User
from app.services.industry import parse_industries, serialize_industries

router = APIRouter(prefix="/preferences", tags=["preferences"])


class PreferenceRequest(BaseModel):
    roles: list[str] | None = None
    locations: list[str] | None = None
    min_salary: int | None = None
    max_salary: int | None = None
    job_type: str | None = None
    work_mode: str | None = None
    excluded_companies: list[str] | None = None
    required_skills: list[str] | None = None
    min_experience_years: int | None = None
    max_experience_years: int | None = None
    include_fresher: bool = False
    industry: str | list[str] | None = None

    @field_validator("industry", mode="before")
    @classmethod
    def _normalize_industry(cls, value: object) -> str | None:
        if value is None:
            return None
        return serialize_industries(parse_industries(value))


class PreferenceResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    roles: list | None
    locations: list | None
    min_salary: int | None
    max_salary: int | None
    job_type: str | None
    work_mode: str | None
    excluded_companies: list | None
    required_skills: list | None
    min_experience_years: int | None
    max_experience_years: int | None
    include_fresher: bool = False
    industry: str | None = None

    model_config = {"from_attributes": True}


async def _get_profile(db: AsyncSession, user: User) -> CandidateProfile:
    return await get_or_create_candidate_profile(db, user)


@router.get("/", response_model=list[PreferenceResponse])
async def list_preferences(
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[JobPreference]:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(JobPreference).where(JobPreference.candidate_id == profile.id)
    )
    return list(result.scalars().all())


@router.post("/", response_model=PreferenceResponse, status_code=status.HTTP_201_CREATED)
async def create_preference(
    body: PreferenceRequest,
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> JobPreference:
    profile = await _get_profile(db, current_user)

    pref = JobPreference(
        candidate_id=profile.id,
        **body.model_dump(),
    )
    db.add(pref)
    await db.flush()
    await db.refresh(pref)
    return pref


@router.put("/{preference_id}", response_model=PreferenceResponse)
async def update_preference(
    preference_id: UUID,
    body: PreferenceRequest,
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> JobPreference:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(JobPreference).where(
            JobPreference.id == preference_id,
            JobPreference.candidate_id == profile.id,
        )
    )
    pref = result.scalar_one_or_none()
    if not pref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference not found")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(pref, key, value)

    await db.flush()
    await db.refresh(pref)
    return pref


@router.delete("/{preference_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_preference(
    preference_id: UUID,
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> None:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(JobPreference).where(
            JobPreference.id == preference_id,
            JobPreference.candidate_id == profile.id,
        )
    )
    pref = result.scalar_one_or_none()
    if not pref:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Preference not found")

    await db.delete(pref)
