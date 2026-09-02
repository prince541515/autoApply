import secrets
import string
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.access import disable_auto_apply_runtime
from app.core.database import get_db
from app.core.platform_settings import (
    BEAT_INTERVAL_KEY,
    DEFAULT_BEAT_MINUTES,
    clamp_beat_minutes,
    get_setting,
    set_setting,
)
from app.core.scrape_quota import (
    DAILY_SCRAPE_LIMIT_KEY,
    DEFAULT_DAILY_SCRAPE_LIMIT,
    MAX_DAILY_SCRAPE_LIMIT,
    MIN_DAILY_SCRAPE_LIMIT,
    clamp_daily_scrape_limit,
    default_daily_limit,
    quota_snapshot,
)
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import require_admin
from app.models.activity import ActivityEvent
from app.models.application import Application
from app.models.candidate import CandidateProfile
from app.models.invite import InviteCode
from app.models.job import JobListing
from app.models.portal import PortalConnection
from app.models.preference import JobPreference
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])

CODE_ALPHABET = string.ascii_uppercase + string.digits


class AdminCreateCandidateRequest(BaseModel):
    user_id: UUID
    full_name: str
    phone: str | None = None
    location: str | None = None
    skills: list[str] | None = None


class PlatformStats(BaseModel):
    total_users: int
    total_candidates: int
    total_applications: int
    total_portals: int
    applications_by_status: dict[str, int]


class AccountStatusRequest(BaseModel):
    status: str


class AutoApplyAllowedRequest(BaseModel):
    allowed: bool


class BeatIntervalRequest(BaseModel):
    interval_minutes: int | None = None


class DailyScrapeLimitRequest(BaseModel):
    daily_limit: int | None = None


class PlatformSettingsRequest(BaseModel):
    beat_scrape_interval_minutes: int
    daily_scrape_limit: int


def _generate_invite_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))


def _plan_for_status(account_status: str) -> str:
    return "basic" if account_status == "pending" else "premium"


def _activity_counts(events: list[ActivityEvent]) -> dict[str, int]:
    fetch_times = 0
    jobs_fetched = 0
    apply_clicks = 0
    auto_applies = 0
    for event in events:
        extra = event.extra or {}
        if event.event_type == "job_fetch":
            fetch_times += 1
            jobs_fetched += int(extra.get("jobs_found") or 0)
        elif event.event_type == "apply_click":
            apply_clicks += 1
        elif event.event_type == "auto_apply":
            auto_applies += 1
    return {
        "fetch_times": fetch_times,
        "jobs_fetched": jobs_fetched,
        "apply_clicks": apply_clicks,
        "auto_applies": auto_applies,
    }


@router.get("/candidates")
async def list_all_candidates(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    users_result = await db.execute(
        select(User).where(User.role == "candidate").order_by(User.created_at.desc())
    )
    users = list(users_result.scalars().all())
    if not users:
        return []

    profiles_result = await db.execute(
        select(CandidateProfile).where(
            CandidateProfile.user_id.in_([user.id for user in users])
        )
    )
    profiles_by_user = {profile.user_id: profile for profile in profiles_result.scalars().all()}

    rows: list[tuple[CandidateProfile, User]] = []
    for user in users:
        profile = profiles_by_user.get(user.id)
        if profile is None:
            profile = await get_or_create_candidate_profile(db, user)
        rows.append((profile, user))

    candidate_ids = [profile.id for profile, _user in rows]
    app_counts = await db.execute(
        select(Application.candidate_id, func.count(Application.id))
        .where(Application.candidate_id.in_(candidate_ids))
        .group_by(Application.candidate_id)
    )
    apps_by_candidate = {row[0]: row[1] for row in app_counts.all()}

    events_result = await db.execute(
        select(ActivityEvent).where(ActivityEvent.candidate_id.in_(candidate_ids))
    )
    events_by_candidate: dict[UUID, list[ActivityEvent]] = {}
    for event in events_result.scalars().all():
        if event.candidate_id is None:
            continue
        events_by_candidate.setdefault(event.candidate_id, []).append(event)

    candidates = []
    for profile, user in rows:
        counts = _activity_counts(events_by_candidate.get(profile.id, []))
        candidates.append(
            {
                "id": str(profile.id),
                "user_id": str(profile.user_id),
                "email": user.email,
                "full_name": profile.full_name,
                "phone": profile.phone,
                "location": profile.location,
                "skills": profile.skills,
                "bio": profile.bio,
                "account_status": user.account_status,
                "plan": _plan_for_status(user.account_status),
                "auto_apply_enabled": profile.auto_apply_enabled,
                "auto_apply_allowed": profile.auto_apply_allowed,
                "beat_scrape_interval_minutes": profile.beat_scrape_interval_minutes,
                "last_beat_scrape_at": profile.last_beat_scrape_at.isoformat()
                if profile.last_beat_scrape_at
                else None,
                "daily_scrape_limit": profile.daily_scrape_limit,
                "application_count": apps_by_candidate.get(profile.id, 0),
                "fetch_times": counts["fetch_times"],
                "jobs_fetched": counts["jobs_fetched"],
                "apply_clicks": counts["apply_clicks"],
                "created_at": profile.created_at.isoformat() if profile.created_at else None,
            }
        )
    return candidates


@router.post("/candidates", status_code=status.HTTP_201_CREATED)
async def create_candidate_for_user(
    body: AdminCreateCandidateRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user_result = await db.execute(select(User).where(User.id == body.user_id))
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    existing = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == body.user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Profile already exists for this user"
        )

    profile = CandidateProfile(
        user_id=body.user_id,
        created_by=admin.id,
        full_name=body.full_name,
        phone=body.phone,
        location=body.location,
        skills=body.skills,
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "full_name": profile.full_name,
    }


@router.get("/stats", response_model=PlatformStats)
async def platform_stats(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> PlatformStats:
    users_count = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    candidates_count = (
        await db.execute(select(func.count()).select_from(CandidateProfile))
    ).scalar() or 0
    apps_count = (
        await db.execute(select(func.count()).select_from(Application))
    ).scalar() or 0
    portals_count = (
        await db.execute(select(func.count()).select_from(PortalConnection))
    ).scalar() or 0

    status_result = await db.execute(
        select(Application.status, func.count()).group_by(Application.status)
    )
    by_status = {row[0]: row[1] for row in status_result.all()}

    return PlatformStats(
        total_users=users_count,
        total_candidates=candidates_count,
        total_applications=apps_count,
        total_portals=portals_count,
        applications_by_status=by_status,
    )


@router.put("/candidates/{candidate_id}/auto-apply-allowed")
async def set_auto_apply_allowed(
    candidate_id: UUID,
    body: AutoApplyAllowedRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    profile.auto_apply_allowed = body.allowed
    if not body.allowed:
        await disable_auto_apply_runtime(db, profile)
    await db.flush()
    return {
        "id": str(profile.id),
        "auto_apply_allowed": profile.auto_apply_allowed,
        "auto_apply_enabled": profile.auto_apply_enabled,
    }


@router.get("/settings")
async def get_platform_settings(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    raw = await get_setting(db, BEAT_INTERVAL_KEY, str(DEFAULT_BEAT_MINUTES))
    daily = await get_setting(db, DAILY_SCRAPE_LIMIT_KEY, str(DEFAULT_DAILY_SCRAPE_LIMIT))
    return {
        "beat_scrape_interval_minutes": clamp_beat_minutes(raw),
        "min_minutes": 5,
        "max_minutes": 24 * 60,
        "daily_scrape_limit": clamp_daily_scrape_limit(daily),
        "min_daily_scrapes": MIN_DAILY_SCRAPE_LIMIT,
        "max_daily_scrapes": MAX_DAILY_SCRAPE_LIMIT,
    }


@router.put("/settings")
async def update_platform_settings(
    body: PlatformSettingsRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    minutes = clamp_beat_minutes(body.beat_scrape_interval_minutes)
    daily = clamp_daily_scrape_limit(body.daily_scrape_limit)
    await set_setting(db, BEAT_INTERVAL_KEY, str(minutes))
    await set_setting(db, DAILY_SCRAPE_LIMIT_KEY, str(daily))
    return {
        "beat_scrape_interval_minutes": minutes,
        "min_minutes": 5,
        "max_minutes": 24 * 60,
        "daily_scrape_limit": daily,
        "min_daily_scrapes": MIN_DAILY_SCRAPE_LIMIT,
        "max_daily_scrapes": MAX_DAILY_SCRAPE_LIMIT,
    }


@router.put("/candidates/{candidate_id}/scrape-limit")
async def set_candidate_scrape_limit(
    candidate_id: UUID,
    body: DailyScrapeLimitRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if body.daily_limit is None:
        profile.daily_scrape_limit = None
    else:
        profile.daily_scrape_limit = clamp_daily_scrape_limit(body.daily_limit)
    await db.flush()
    snap = quota_snapshot(profile, await default_daily_limit(db))
    return {
        "id": str(profile.id),
        "daily_scrape_limit": profile.daily_scrape_limit,
        **snap,
    }


@router.put("/candidates/{candidate_id}/beat-scrape")
async def set_candidate_beat_scrape(
    candidate_id: UUID,
    body: BeatIntervalRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    if body.interval_minutes is None:
        profile.beat_scrape_interval_minutes = None
    else:
        profile.beat_scrape_interval_minutes = clamp_beat_minutes(body.interval_minutes)
    await db.flush()
    default_minutes = clamp_beat_minutes(
        await get_setting(db, BEAT_INTERVAL_KEY, str(DEFAULT_BEAT_MINUTES))
    )
    return {
        "id": str(profile.id),
        "beat_scrape_interval_minutes": profile.beat_scrape_interval_minutes,
        "effective_interval_minutes": profile.beat_scrape_interval_minutes or default_minutes,
        "last_beat_scrape_at": profile.last_beat_scrape_at.isoformat()
        if profile.last_beat_scrape_at
        else None,
    }


@router.put("/candidates/{candidate_id}/status")
async def set_candidate_status(
    candidate_id: UUID,
    body: AccountStatusRequest,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    new_status = body.status.strip().lower()
    if new_status not in {"active", "paused", "suspended"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Status must be active, paused, or suspended",
        )

    result = await db.execute(
        select(CandidateProfile)
        .options(selectinload(CandidateProfile.user))
        .where(CandidateProfile.id == candidate_id)
    )
    profile = result.scalar_one_or_none()
    if not profile or not profile.user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

    user = profile.user
    if user.account_status == "pending" and new_status != "suspended":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pending candidates must activate with an invite code first",
        )

    user.account_status = new_status
    user.is_active = new_status != "suspended"
    if new_status in {"paused", "suspended"}:
        await disable_auto_apply_runtime(db, profile)
    await db.flush()
    return {
        "id": str(profile.id),
        "account_status": user.account_status,
        "is_active": user.is_active,
        "auto_apply_enabled": profile.auto_apply_enabled,
    }


def _iso(dt) -> str | None:
    return dt.isoformat() if dt else None


def _event_summary(event: ActivityEvent, jobs: dict[str, JobListing]) -> str:
    extra = event.extra or {}
    job = jobs.get(str(extra.get("job_id") or ""))
    job_label = f"{job.title} · {job.company}" if job else None

    if event.event_type == "job_fetch":
        found = extra.get("jobs_found")
        portal = extra.get("portal") or extra.get("source") or "all portals"
        count = f"{found} new job{'s' if found != 1 else ''}" if found is not None else "jobs"
        return f"Fetched {count} from {portal}"
    if event.event_type == "apply_click":
        mode = extra.get("mode") or "click"
        return f"Apply clicked ({mode})" + (f" — {job_label}" if job_label else "")
    if event.event_type == "auto_apply":
        status = extra.get("status")
        suffix = f" · {status}" if status else ""
        return f"Auto-apply{suffix}" + (f" — {job_label}" if job_label else "")
    return event.event_type.replace("_", " ")


@router.get("/candidates/{candidate_id}/activity")
async def candidate_activity(
    candidate_id: UUID,
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    result = await db.execute(
        select(CandidateProfile, User)
        .join(User, User.id == CandidateProfile.user_id)
        .where(CandidateProfile.id == candidate_id)
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    profile, user = row

    events_result = await db.execute(
        select(ActivityEvent)
        .where(ActivityEvent.candidate_id == candidate_id)
        .order_by(ActivityEvent.created_at.desc())
    )
    events = list(events_result.scalars().all())
    counts = _activity_counts(events)

    job_ids: list[UUID] = []
    for event in events:
        raw_id = (event.extra or {}).get("job_id")
        if not raw_id:
            continue
        try:
            job_ids.append(UUID(str(raw_id)))
        except ValueError:
            continue

    apps_result = await db.execute(
        select(Application)
        .options(selectinload(Application.job))
        .where(Application.candidate_id == candidate_id)
        .order_by(Application.created_at.desc())
    )
    applications = list(apps_result.scalars().all())
    for app in applications:
        job_ids.append(app.job_id)

    jobs_by_id: dict[str, JobListing] = {}
    unique_job_ids = list(dict.fromkeys(job_ids))
    if unique_job_ids:
        jobs_result = await db.execute(select(JobListing).where(JobListing.id.in_(unique_job_ids)))
        jobs_by_id = {str(job.id): job for job in jobs_result.scalars().all()}

    last_fetch = next((e for e in events if e.event_type == "job_fetch"), None)
    last_apply_click = next((e for e in events if e.event_type == "apply_click"), None)
    last_auto_apply = next((e for e in events if e.event_type == "auto_apply"), None)

    apps_by_status: dict[str, int] = {}
    applied_count = 0
    for app in applications:
        apps_by_status[app.status] = apps_by_status.get(app.status, 0) + 1
        if app.status in {"applied", "viewed", "shortlisted", "interview"}:
            applied_count += 1

    portals_result = await db.execute(
        select(PortalConnection).where(PortalConnection.candidate_id == candidate_id)
    )
    portals = list(portals_result.scalars().all())

    prefs_result = await db.execute(
        select(JobPreference).where(JobPreference.candidate_id == candidate_id)
    )
    prefs = prefs_result.scalar_one_or_none()

    def _job_payload(job: JobListing | None) -> dict | None:
        if not job:
            return None
        return {
            "id": str(job.id),
            "title": job.title,
            "company": job.company,
            "portal": job.portal,
            "location": job.location,
            "url": job.url,
        }

    return {
        "id": str(profile.id),
        "user_id": str(profile.user_id),
        "email": user.email,
        "full_name": profile.full_name,
        "phone": profile.phone,
        "location": profile.location,
        "account_status": user.account_status,
        "plan": _plan_for_status(user.account_status),
        "auto_apply_allowed": profile.auto_apply_allowed,
        "auto_apply_enabled": profile.auto_apply_enabled,
        "beat_scrape_interval_minutes": profile.beat_scrape_interval_minutes,
        "last_beat_scrape_at": _iso(profile.last_beat_scrape_at),
        "daily_scrape_limit": profile.daily_scrape_limit,
        "scrape_quota": quota_snapshot(profile, await default_daily_limit(db)),
        "application_count": len(applications),
        "applied_count": applied_count,
        "applications_by_status": apps_by_status,
        "last_fetch_at": _iso(last_fetch.created_at) if last_fetch else None,
        "last_apply_click_at": _iso(last_apply_click.created_at) if last_apply_click else None,
        "last_auto_apply_at": _iso(last_auto_apply.created_at) if last_auto_apply else None,
        **counts,
        "events": [
            {
                "id": str(event.id),
                "event_type": event.event_type,
                "summary": _event_summary(event, jobs_by_id),
                "metadata": event.extra,
                "created_at": _iso(event.created_at),
            }
            for event in events[:400]
        ],
        "applications": [
            {
                "id": str(app.id),
                "status": app.status,
                "portal": app.portal,
                "applied_at": _iso(app.applied_at),
                "created_at": _iso(app.created_at),
                "job": _job_payload(app.job or jobs_by_id.get(str(app.job_id))),
            }
            for app in applications[:200]
        ],
        "portals": [
            {
                "id": str(portal.id),
                "portal": portal.portal,
                "is_active": portal.is_active,
                "last_synced": _iso(portal.last_synced),
            }
            for portal in portals
        ],
        "preferences": None
        if not prefs
        else {
            "roles": prefs.roles or [],
            "locations": prefs.locations or [],
            "job_type": prefs.job_type,
            "work_mode": prefs.work_mode,
            "industry": prefs.industry,
            "min_salary": prefs.min_salary,
            "max_salary": prefs.max_salary,
        },
    }


@router.get("/invites")
async def list_invites(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    result = await db.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
    invites = result.scalars().all()
    return [
        {
            "id": str(invite.id),
            "code": invite.code,
            "created_by": str(invite.created_by),
            "used_by": str(invite.used_by) if invite.used_by else None,
            "used_at": invite.used_at.isoformat() if invite.used_at else None,
            "created_at": invite.created_at.isoformat() if invite.created_at else None,
            "used": invite.used_by is not None,
        }
        for invite in invites
    ]


@router.post("/invites", status_code=status.HTTP_201_CREATED)
async def create_invite(
    admin: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> dict:
    code = _generate_invite_code()
    for _ in range(5):
        exists = await db.execute(select(InviteCode.id).where(InviteCode.code == code))
        if exists.scalar_one_or_none() is None:
            break
        code = _generate_invite_code()

    invite = InviteCode(code=code, created_by=admin.id)
    db.add(invite)
    await db.flush()
    await db.commit()
    await db.refresh(invite)
    return {
        "id": str(invite.id),
        "code": invite.code,
        "created_at": invite.created_at.isoformat() if invite.created_at else None,
        "used": False,
    }
