import csv
import io
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer, joinedload

from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import require_active_candidate
from app.models.application import Application
from app.models.candidate import CandidateProfile
from app.models.job import JobListing
from app.models.user import User
from app.services.activity import record_activity

router = APIRouter(prefix="/applications", tags=["applications"])


class ApplicationResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    status: str
    portal: str
    external_app_id: str | None
    apply_response: str | None
    applied_at: datetime | None
    status_updated_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class ApplicationWithJobResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    job_id: UUID
    status: str
    portal: str
    external_app_id: str | None
    apply_response: str | None
    applied_at: datetime | None
    status_updated_at: datetime
    created_at: datetime
    job_title: str
    company: str
    job_url: str
    job_description: str | None

    model_config = {"from_attributes": True}


class PaginatedApplications(BaseModel):
    items: list[ApplicationWithJobResponse]
    total: int
    page: int
    per_page: int


class ApplicationStats(BaseModel):
    total: int
    by_status: dict[str, int]
    by_portal: dict[str, int]


class BulkActionResponse(BaseModel):
    affected: int
    message: str


class CreateApplicationRequest(BaseModel):
    job_id: UUID


class CreateApplicationResponse(BaseModel):
    message: str
    application_id: str | None = None
    status: str = "queued"


ALLOWED_MANUAL_STATUSES = {
    "applied",
    "viewed",
    "shortlisted",
    "interview",
    "rejected",
    "withdrawn",
    "removed",
}


class MarkStatusRequest(BaseModel):
    job_id: UUID
    status: str = "applied"


class BulkMarkRequest(BaseModel):
    job_ids: list[UUID]
    status: str = "applied"


class UpdateStatusRequest(BaseModel):
    status: str


async def _get_profile(db: AsyncSession, user: User) -> CandidateProfile:
    return await get_or_create_candidate_profile(db, user)


def _app_to_response(app: Application) -> ApplicationWithJobResponse:
    job = app.job
    return ApplicationWithJobResponse(
        id=app.id,
        candidate_id=app.candidate_id,
        job_id=app.job_id,
        status=app.status,
        portal=app.portal,
        external_app_id=app.external_app_id,
        apply_response=app.apply_response,
        applied_at=app.applied_at,
        status_updated_at=app.status_updated_at,
        created_at=app.created_at,
        job_title=job.title if job else "Unknown",
        company=job.company if job else "Unknown",
        job_url=job.url if job else "",
        job_description=job.description if job else None,
    )


@router.get("/stats", response_model=ApplicationStats)
async def application_stats(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> ApplicationStats:
    profile = await _get_profile(db, current_user)

    base = select(Application).where(Application.candidate_id == profile.id)

    total_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = total_result.scalar() or 0

    status_result = await db.execute(
        select(Application.status, func.count())
        .where(Application.candidate_id == profile.id)
        .group_by(Application.status)
    )
    by_status = {row[0]: row[1] for row in status_result.all()}

    portal_result = await db.execute(
        select(Application.portal, func.count())
        .where(Application.candidate_id == profile.id)
        .group_by(Application.portal)
    )
    by_portal = {row[0]: row[1] for row in portal_result.all()}

    return ApplicationStats(total=total, by_status=by_status, by_portal=by_portal)


SORTABLE_COLUMNS = {
    "created_at": Application.created_at,
    "applied_at": Application.applied_at,
    "status": Application.status,
    "portal": Application.portal,
    "status_updated_at": Application.status_updated_at,
    "job_title": JobListing.title,
    "company": JobListing.company,
}


async def _log_status_mark(
    db: AsyncSession,
    *,
    user_id,
    candidate_id,
    job_id: str,
    status_value: str,
) -> None:
    from app.services.activity import record_activity

    if status_value == "applied":
        await record_activity(
            db,
            user_id=user_id,
            candidate_id=candidate_id,
            event_type="apply_click",
            metadata={"job_id": job_id, "mode": "manual", "status": status_value},
        )
        return
    await record_activity(
        db,
        user_id=user_id,
        candidate_id=candidate_id,
        event_type="status_mark",
        metadata={"job_id": job_id, "status": status_value, "mode": "manual"},
    )


@router.post("/", response_model=CreateApplicationResponse)
async def create_application(
    body: CreateApplicationRequest,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> CreateApplicationResponse:
    import asyncio

    from app.core.sync_database import get_sync_db
    from app.services.applier import create_and_apply_job

    profile = await _get_profile(db, current_user)
    if not profile.auto_apply_allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Auto-apply is not allowed for this account.",
        )
    candidate_id = str(profile.id)
    job_id = str(body.job_id)

    def _run() -> dict:
        sync_db = get_sync_db()
        try:
            return create_and_apply_job(sync_db, candidate_id, job_id)
        finally:
            sync_db.close()

    result = await asyncio.to_thread(_run)
    http_status = int(result.get("http_status") or 0)
    if http_status in (400, 404, 409):
        raise HTTPException(status_code=http_status, detail=result.get("message") or "Apply failed")

    await record_activity(
        db,
        user_id=current_user.id,
        candidate_id=profile.id,
        event_type="apply_click",
        metadata={"job_id": job_id, "mode": "in_app"},
    )
    await record_activity(
        db,
        user_id=current_user.id,
        candidate_id=profile.id,
        event_type="auto_apply",
        metadata={"job_id": job_id, "status": result.get("status")},
    )
    return CreateApplicationResponse(
        message=result.get("message") or "Application submitted",
        application_id=result.get("application_id"),
        status=result.get("status") or "failed",
    )


@router.post("/mark", response_model=CreateApplicationResponse)
async def mark_application_status(
    body: MarkStatusRequest,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> CreateApplicationResponse:
    """Record a manual status for a job (e.g. applied outside AutoApply)."""
    if body.status not in ALLOWED_MANUAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Status must be one of: {', '.join(sorted(ALLOWED_MANUAL_STATUSES))}",
        )

    profile = await _get_profile(db, current_user)

    job_result = await db.execute(
        select(JobListing).where(
            JobListing.id == body.job_id,
            JobListing.candidate_id == profile.id,
        )
    )
    job = job_result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    existing_result = await db.execute(
        select(Application).where(
            Application.candidate_id == profile.id,
            Application.job_id == body.job_id,
        )
    )
    note = "Removed from matched jobs" if body.status == "removed" else "Marked manually"
    app = existing_result.scalar_one_or_none()
    if app:
        app.status = body.status
        if body.status == "applied" and not app.applied_at:
            app.applied_at = datetime.now(timezone.utc)
        app.apply_response = app.apply_response or note
    else:
        app = Application(
            candidate_id=profile.id,
            job_id=body.job_id,
            status=body.status,
            portal=job.portal,
            applied_at=datetime.now(timezone.utc) if body.status == "applied" else None,
            apply_response=note,
        )
        db.add(app)

    await db.flush()

    if body.status in ALLOWED_MANUAL_STATUSES:
        await _log_status_mark(
            db,
            user_id=current_user.id,
            candidate_id=profile.id,
            job_id=str(body.job_id),
            status_value=body.status,
        )

    return CreateApplicationResponse(
        message="Removed from matched jobs" if body.status == "removed" else f"Marked as {body.status}",
        application_id=str(app.id),
        status=app.status,
    )


@router.post("/mark-bulk", response_model=BulkActionResponse)
async def mark_applications_bulk(
    body: BulkMarkRequest,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> BulkActionResponse:
    if body.status not in ALLOWED_MANUAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Status must be one of: {', '.join(sorted(ALLOWED_MANUAL_STATUSES))}",
        )
    job_ids = list(dict.fromkeys(body.job_ids))[:50]
    if not job_ids:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No jobs selected")

    profile = await _get_profile(db, current_user)
    jobs_result = await db.execute(
        select(JobListing).where(
            JobListing.id.in_(job_ids),
            JobListing.candidate_id == profile.id,
        )
    )
    jobs = {job.id: job for job in jobs_result.scalars().all()}
    existing_result = await db.execute(
        select(Application).where(
            Application.candidate_id == profile.id,
            Application.job_id.in_(job_ids),
        )
    )
    existing = {app.job_id: app for app in existing_result.scalars().all()}
    note = "Removed from matched jobs" if body.status == "removed" else "Marked manually"
    now = datetime.now(timezone.utc)
    affected = 0
    for job_id in job_ids:
        job = jobs.get(job_id)
        if not job:
            continue
        app = existing.get(job_id)
        if app:
            app.status = body.status
            if body.status == "applied" and not app.applied_at:
                app.applied_at = now
            app.apply_response = app.apply_response or note
        else:
            db.add(
                Application(
                    candidate_id=profile.id,
                    job_id=job_id,
                    status=body.status,
                    portal=job.portal,
                    applied_at=now if body.status == "applied" else None,
                    apply_response=note,
                )
            )
        affected += 1

    await db.flush()
    if body.status in ALLOWED_MANUAL_STATUSES:
        for job_id in job_ids:
            if job_id not in jobs:
                continue
            await _log_status_mark(
                db,
                user_id=current_user.id,
                candidate_id=profile.id,
                job_id=str(job_id),
                status_value=body.status,
            )
    return BulkActionResponse(
        affected=affected,
        message=f"Updated {affected} job{'s' if affected != 1 else ''} to {body.status}",
    )


@router.patch("/{application_id}", response_model=ApplicationResponse)
async def update_application_status(
    application_id: UUID,
    body: UpdateStatusRequest,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> Application:
    """Manually change the status of an existing application."""
    if body.status not in ALLOWED_MANUAL_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Status must be one of: {', '.join(sorted(ALLOWED_MANUAL_STATUSES))}",
        )

    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(Application).where(
            Application.id == application_id,
            Application.candidate_id == profile.id,
        )
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Application not found")

    app.status = body.status
    if body.status == "applied" and not app.applied_at:
        app.applied_at = datetime.now(timezone.utc)
    await db.flush()
    await _log_status_mark(
        db,
        user_id=current_user.id,
        candidate_id=profile.id,
        job_id=str(app.job_id),
        status_value=body.status,
    )
    return app


@router.get("/", response_model=PaginatedApplications)
async def list_applications(
    status_filter: list[str] | None = Query(None, alias="status"),
    portal: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    search: str | None = None,
    sort_by: str = "created_at",
    sort_dir: str = "desc",
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> PaginatedApplications:
    profile = await _get_profile(db, current_user)

    base_filter = Application.candidate_id == profile.id
    query = (
        select(Application)
        .join(JobListing, Application.job_id == JobListing.id)
        .where(base_filter)
    )
    count_query = (
        select(func.count())
        .select_from(Application)
        .join(JobListing, Application.job_id == JobListing.id)
        .where(base_filter)
    )

    if status_filter:
        query = query.where(Application.status.in_(status_filter))
        count_query = count_query.where(Application.status.in_(status_filter))
    else:
        query = query.where(Application.status != "removed")
        count_query = count_query.where(Application.status != "removed")
    if portal:
        query = query.where(Application.portal == portal)
        count_query = count_query.where(Application.portal == portal)
    if from_date:
        query = query.where(Application.created_at >= from_date)
        count_query = count_query.where(Application.created_at >= from_date)
    if to_date:
        query = query.where(Application.created_at <= to_date)
        count_query = count_query.where(Application.created_at <= to_date)
    if search:
        like = f"%{search}%"
        search_cond = (JobListing.title.ilike(like)) | (JobListing.company.ilike(like))
        query = query.where(search_cond)
        count_query = count_query.where(search_cond)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    sort_col = SORTABLE_COLUMNS.get(sort_by, Application.created_at)
    order = sort_col.desc() if sort_dir == "desc" else sort_col.asc()
    query = query.order_by(order)

    offset = (page - 1) * per_page
    query = query.offset(offset).limit(per_page).options(
        joinedload(Application.job).defer(JobListing.raw_data)
    )

    result = await db.execute(query)
    apps = result.unique().scalars().all()

    return PaginatedApplications(
        items=[_app_to_response(a) for a in apps],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/export")
async def export_applications(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> StreamingResponse:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        select(Application)
        .join(JobListing, Application.job_id == JobListing.id)
        .where(Application.candidate_id == profile.id)
        .order_by(Application.created_at.desc())
        .options(joinedload(Application.job))
    )
    apps = result.unique().scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Job Title", "Company", "Portal", "Status", "Applied Date", "Last Updated", "URL"])

    for app in apps:
        job = app.job
        writer.writerow([
            job.title if job else "",
            job.company if job else "",
            app.portal,
            app.status,
            app.applied_at.isoformat() if app.applied_at else "",
            app.status_updated_at.isoformat(),
            job.url if job else "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=applications.csv"},
    )


@router.post("/bulk-retry", response_model=BulkActionResponse)
async def bulk_retry(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> BulkActionResponse:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        update(Application)
        .where(
            Application.candidate_id == profile.id,
            Application.status == "rejected",
        )
        .values(status="queued")
        .execution_options(synchronize_session=False)
    )
    await db.commit()

    return BulkActionResponse(
        affected=result.rowcount,
        message=f"Re-queued {result.rowcount} failed applications",
    )


@router.post("/bulk-cancel", response_model=BulkActionResponse)
async def bulk_cancel(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> BulkActionResponse:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        update(Application)
        .where(
            Application.candidate_id == profile.id,
            Application.status == "queued",
        )
        .values(status="cancelled")
        .execution_options(synchronize_session=False)
    )
    await db.commit()

    return BulkActionResponse(
        affected=result.rowcount,
        message=f"Cancelled {result.rowcount} queued applications",
    )


@router.get("/{application_id}", response_model=ApplicationResponse)
async def get_application(
    application_id: UUID,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> Application:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(Application).where(
            Application.id == application_id,
            Application.candidate_id == profile.id,
        )
    )
    app = result.scalar_one_or_none()
    if not app:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Application not found"
        )
    return app
