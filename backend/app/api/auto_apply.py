"""Auto-apply control endpoints — trigger, pause, resume, and status."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import auto_apply_effective
from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import get_current_user, require_active_candidate
from app.models.application import Application
from app.models.candidate import CandidateProfile
from app.models.job import JobListing
from app.models.portal import PortalConnection
from app.models.user import User
from app.services.job_matcher import (
    create_applications_for_matches,
    match_jobs_to_candidates,
)
from app.services.rate_limiter import get_all_rate_limit_status

router = APIRouter(prefix="/auto-apply", tags=["auto-apply"])

logger = logging.getLogger(__name__)


class AutoApplyTriggerResponse(BaseModel):
    message: str
    queued_count: int
    task_id: str | None = None


class AutoApplyStatusResponse(BaseModel):
    auto_apply_enabled: bool
    auto_apply_allowed: bool
    total_queued: int
    total_applying: int
    total_applied: int
    total_failed: int
    active_portals: list[str]


class RateLimitStatusResponse(BaseModel):
    portal: str
    hourly_used: int
    hourly_limit: int
    daily_used: int
    daily_limit: int
    allowed: bool
    retry_after_seconds: int


class AllRateLimitsResponse(BaseModel):
    portals: list[RateLimitStatusResponse]


class ManualApplyResponse(BaseModel):
    message: str
    application_id: str | None = None
    task_id: str | None = None
    status: str = "queued"


class MessageResponse(BaseModel):
    message: str


async def _get_profile(db: AsyncSession, user: User) -> CandidateProfile:
    return await get_or_create_candidate_profile(db, user)


@router.post("/trigger", response_model=AutoApplyTriggerResponse)
async def trigger_auto_apply(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> AutoApplyTriggerResponse:
    """Manually trigger auto-apply: match unprocessed jobs and queue applications."""
    profile = await _get_profile(db, current_user)

    if not auto_apply_effective(profile):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Auto-apply is not allowed for this account. Ask an admin to enable it.",
        )

    portals_result = await db.execute(
        select(PortalConnection).where(
            PortalConnection.candidate_id == profile.id,
            PortalConnection.is_active.is_(True),
        )
    )
    active_portals = portals_result.scalars().all()
    if not active_portals:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No active portal connections. Connect at least one portal first.",
        )

    portal_names = [p.portal for p in active_portals]

    jobs_result = await db.execute(
        select(JobListing).where(JobListing.portal.in_(portal_names))
    )
    jobs = list(jobs_result.scalars().all())

    if not jobs:
        return AutoApplyTriggerResponse(message="No jobs found to match", queued_count=0)

    from app.core.sync_database import get_sync_db
    sync_db = get_sync_db()
    try:
        matches = match_jobs_to_candidates(jobs, sync_db)
        candidate_matches = [
            (cid, jid, score) for cid, jid, score in matches if cid == str(profile.id)
        ]

        if not candidate_matches:
            return AutoApplyTriggerResponse(message="No matching jobs found above threshold", queued_count=0)

        portal_lookup = {str(j.id): j.portal for j in jobs}
        applications = create_applications_for_matches(candidate_matches, sync_db, portal_lookup)
    finally:
        sync_db.close()

    if not applications:
        return AutoApplyTriggerResponse(message="All matching jobs already have applications", queued_count=0)

    from app.workers.auto_apply import batch_apply
    app_ids = [str(a.id) for a in applications]
    task = batch_apply.delay(app_ids)

    logger.info(
        "Triggered auto-apply for candidate %s: %d applications queued",
        profile.id, len(applications),
    )

    return AutoApplyTriggerResponse(
        message=f"Queued {len(applications)} applications for auto-apply",
        queued_count=len(applications),
        task_id=task.id,
    )


@router.post("/pause", response_model=MessageResponse)
async def pause_auto_apply(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Pause auto-apply for the current candidate."""
    profile = await _get_profile(db, current_user)

    if not profile.auto_apply_enabled:
        return MessageResponse(message="Auto-apply is already paused")

    await db.execute(
        update(CandidateProfile)
        .where(CandidateProfile.id == profile.id)
        .values(auto_apply_enabled=False)
    )

    await db.execute(
        update(Application)
        .where(
            Application.candidate_id == profile.id,
            Application.status == "queued",
        )
        .values(status="paused")
        .execution_options(synchronize_session=False)
    )

    await db.commit()
    logger.info("Auto-apply paused for candidate %s", profile.id)
    return MessageResponse(message="Auto-apply paused. Queued applications have been paused.")


@router.post("/resume", response_model=MessageResponse)
async def resume_auto_apply(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    """Resume auto-apply for the current candidate."""
    profile = await _get_profile(db, current_user)

    if not profile.auto_apply_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Auto-apply is not allowed for this account. Ask an admin to enable it.",
        )

    if profile.auto_apply_enabled:
        return MessageResponse(message="Auto-apply is already running")

    await db.execute(
        update(CandidateProfile)
        .where(CandidateProfile.id == profile.id)
        .values(auto_apply_enabled=True)
    )

    result = await db.execute(
        update(Application)
        .where(
            Application.candidate_id == profile.id,
            Application.status == "paused",
        )
        .values(status="queued")
        .execution_options(synchronize_session=False)
    )
    requeued = result.rowcount

    await db.commit()

    if requeued > 0:
        from app.workers.auto_apply import batch_apply

        paused_result = await db.execute(
            select(Application.id).where(
                Application.candidate_id == profile.id,
                Application.status == "queued",
            )
        )
        app_ids = [str(row[0]) for row in paused_result.all()]
        if app_ids:
            batch_apply.delay(app_ids)

    logger.info("Auto-apply resumed for candidate %s, re-queued %d applications", profile.id, requeued)
    return MessageResponse(
        message=f"Auto-apply resumed. {requeued} paused applications re-queued."
    )


@router.get("/status", response_model=AutoApplyStatusResponse)
async def get_auto_apply_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AutoApplyStatusResponse:
    """Get current auto-apply status for the candidate."""
    profile = await _get_profile(db, current_user)

    status_counts_result = await db.execute(
        select(Application.status, func.count())
        .where(Application.candidate_id == profile.id)
        .group_by(Application.status)
    )
    counts = {row[0]: row[1] for row in status_counts_result.all()}

    portals_result = await db.execute(
        select(PortalConnection.portal).where(
            PortalConnection.candidate_id == profile.id,
            PortalConnection.is_active.is_(True),
        )
    )
    active_portals = [row[0] for row in portals_result.all()]

    return AutoApplyStatusResponse(
        auto_apply_enabled=auto_apply_effective(profile),
        auto_apply_allowed=profile.auto_apply_allowed,
        total_queued=counts.get("queued", 0) + counts.get("paused", 0),
        total_applying=counts.get("applying", 0),
        total_applied=counts.get("applied", 0),
        total_failed=counts.get("failed", 0),
        active_portals=active_portals,
    )


@router.get("/rate-limits", response_model=AllRateLimitsResponse)
async def get_rate_limits(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AllRateLimitsResponse:
    """Get current rate limit status per portal for the candidate."""
    profile = await _get_profile(db, current_user)

    all_limits = get_all_rate_limit_status(str(profile.id))

    portals = []
    for portal_name, data in all_limits.items():
        portals.append(RateLimitStatusResponse(
            portal=portal_name,
            hourly_used=data["hourly_used"],
            hourly_limit=data["hourly_limit"],
            daily_used=data["daily_used"],
            daily_limit=data["daily_limit"],
            allowed=data["allowed"],
            retry_after_seconds=data["retry_after_seconds"],
        ))

    return AllRateLimitsResponse(portals=portals)


@router.post("/apply/{job_id}", response_model=ManualApplyResponse)
async def manual_apply_to_job(
    job_id: UUID,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> ManualApplyResponse:
    """Apply to a specific job immediately."""
    import asyncio

    from app.core.sync_database import get_sync_db
    from app.services.activity import record_activity
    from app.services.applier import create_and_apply_job

    profile = await _get_profile(db, current_user)
    if not profile.auto_apply_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Auto-apply is not allowed for this account.",
        )
    candidate_id = str(profile.id)
    job_key = str(job_id)

    def _run() -> dict:
        sync_db = get_sync_db()
        try:
            return create_and_apply_job(sync_db, candidate_id, job_key)
        finally:
            sync_db.close()

    result = await asyncio.to_thread(_run)
    http_status = int(result.get("http_status") or 0)
    if http_status in (400, 404, 409):
        raise HTTPException(status_code=http_status, detail=result.get("message") or "Apply failed")

    logger.info("Manual apply for job %s: %s", job_id, result.get("status"))
    await record_activity(
        db,
        user_id=current_user.id,
        candidate_id=profile.id,
        event_type="auto_apply",
        metadata={"job_id": str(job_id), "status": result.get("status")},
    )
    return ManualApplyResponse(
        message=result.get("message") or "Application submitted",
        application_id=result.get("application_id"),
        status=result.get("status") or "failed",
    )
