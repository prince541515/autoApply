from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import case, cast, func, select, Date, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import require_activated_candidate, require_admin
from app.models.application import Application
from app.models.candidate import CandidateProfile
from app.models.job import JobListing
from app.models.portal import PortalConnection
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


class DashboardStats(BaseModel):
    total_applications: int
    applied_count: int
    shortlisted_count: int
    rejected_count: int
    interview_count: int
    active_portals: int
    success_rate: float
    total_applications_trend: float
    shortlisted_trend: float
    interview_trend: float
    success_rate_trend: float


class RecentApplication(BaseModel):
    id: str
    status: str
    portal: str
    applied_at: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class ChartDataPoint(BaseModel):
    date: str
    count: int


class PipelineStage(BaseModel):
    stage: str
    count: int
    percentage: float


class PortalDistribution(BaseModel):
    portal: str
    count: int
    percentage: float


class StatusBreakdown(BaseModel):
    status: str
    count: int


class ActivityItem(BaseModel):
    id: str
    job_title: str
    company: str
    portal: str
    old_status: str
    new_status: str
    timestamp: str


class AdminStats(BaseModel):
    total_candidates: int
    active_auto_apply: int
    total_applications_today: int
    overall_success_rate: float


class AdminTopCandidate(BaseModel):
    id: str
    full_name: str
    application_count: int
    success_rate: float


class PortalPerformance(BaseModel):
    portal: str
    success_rate: float
    total: int


class AdminRecentApplication(BaseModel):
    id: str
    job_title: str
    company: str
    portal: str
    status: str
    candidate_name: str
    applied_at: datetime | None
    created_at: datetime


class SystemStatus(BaseModel):
    active_workers: int
    queue_depth: int
    last_scrape_time: str | None


class AdminDashboardData(BaseModel):
    stats: AdminStats
    activity_over_time: list[ChartDataPoint]
    top_candidates: list[AdminTopCandidate]
    portal_performance: list[PortalPerformance]
    recent_applications: list[AdminRecentApplication]
    system_status: SystemStatus


async def _get_profile(db: AsyncSession, user: User) -> CandidateProfile:
    return await get_or_create_candidate_profile(db, user)


def _compute_trend(current: int | float, previous: int | float) -> float:
    if previous == 0:
        return 100.0 if current > 0 else 0.0
    return round(((current - previous) / previous) * 100, 1)


@router.get("/stats", response_model=DashboardStats)
async def dashboard_stats(
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> DashboardStats:
    profile = await _get_profile(db, current_user)
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    two_weeks_ago = now - timedelta(days=14)

    counts = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Application.status == "applied").label("applied"),
            func.count().filter(Application.status == "shortlisted").label("shortlisted"),
            func.count().filter(Application.status == "rejected").label("rejected"),
            func.count().filter(Application.status == "interview").label("interview"),
        ).where(Application.candidate_id == profile.id)
    )
    row = counts.one()

    prev_counts = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Application.status == "shortlisted").label("shortlisted"),
            func.count().filter(Application.status == "interview").label("interview"),
        ).where(
            Application.candidate_id == profile.id,
            Application.created_at < week_ago,
            Application.created_at >= two_weeks_ago,
        )
    )
    prev = prev_counts.one()

    this_week_counts = await db.execute(
        select(
            func.count().label("total"),
            func.count().filter(Application.status == "shortlisted").label("shortlisted"),
            func.count().filter(Application.status == "interview").label("interview"),
        ).where(
            Application.candidate_id == profile.id,
            Application.created_at >= week_ago,
        )
    )
    this_week = this_week_counts.one()

    portal_count = await db.execute(
        select(func.count()).where(
            PortalConnection.candidate_id == profile.id,
            PortalConnection.is_active.is_(True),
        )
    )
    active_portals = portal_count.scalar() or 0

    total = row.total or 0
    positive = (row.shortlisted or 0) + (row.interview or 0)
    success_rate = (positive / total * 100) if total > 0 else 0.0

    prev_total = prev.total or 0
    prev_positive = (prev.shortlisted or 0) + (prev.interview or 0)
    prev_success = (prev_positive / prev_total * 100) if prev_total > 0 else 0.0

    return DashboardStats(
        total_applications=total,
        applied_count=row.applied or 0,
        shortlisted_count=row.shortlisted or 0,
        rejected_count=row.rejected or 0,
        interview_count=row.interview or 0,
        active_portals=active_portals,
        success_rate=round(success_rate, 2),
        total_applications_trend=_compute_trend(this_week.total or 0, prev_total),
        shortlisted_trend=_compute_trend(this_week.shortlisted or 0, prev.shortlisted or 0),
        interview_trend=_compute_trend(this_week.interview or 0, prev.interview or 0),
        success_rate_trend=round(success_rate - prev_success, 1),
    )


@router.get("/recent", response_model=list[RecentApplication])
async def recent_applications(
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[Application]:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        select(Application)
        .where(Application.candidate_id == profile.id)
        .order_by(Application.created_at.desc())
        .limit(10)
    )
    return list(result.scalars().all())


@router.get("/chart-data", response_model=list[ChartDataPoint])
async def chart_data(
    days: int = 30,
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[ChartDataPoint]:
    profile = await _get_profile(db, current_user)
    since = datetime.now(timezone.utc) - timedelta(days=days)

    result = await db.execute(
        select(
            cast(Application.created_at, Date).label("date"),
            func.count().label("count"),
        )
        .where(
            Application.candidate_id == profile.id,
            Application.created_at >= since,
        )
        .group_by(cast(Application.created_at, Date))
        .order_by(cast(Application.created_at, Date))
    )

    return [
        ChartDataPoint(date=str(row.date), count=row.count)
        for row in result.all()
    ]


@router.get("/pipeline", response_model=list[PipelineStage])
async def pipeline_data(
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[PipelineStage]:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        select(Application.status, func.count().label("count"))
        .where(Application.candidate_id == profile.id)
        .group_by(Application.status)
    )
    rows = {r[0]: r[1] for r in result.all()}

    stages = ["queued", "applying", "applied", "viewed", "shortlisted", "interview"]
    total = sum(rows.values()) or 1

    return [
        PipelineStage(
            stage=s,
            count=rows.get(s, 0),
            percentage=round(rows.get(s, 0) / total * 100, 1),
        )
        for s in stages
    ]


@router.get("/portal-distribution", response_model=list[PortalDistribution])
async def portal_distribution(
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[PortalDistribution]:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        select(Application.portal, func.count().label("count"))
        .where(Application.candidate_id == profile.id)
        .group_by(Application.portal)
        .order_by(func.count().desc())
    )
    rows = result.all()
    total = sum(r.count for r in rows) or 1

    return [
        PortalDistribution(
            portal=r.portal,
            count=r.count,
            percentage=round(r.count / total * 100, 1),
        )
        for r in rows
    ]


@router.get("/status-breakdown", response_model=list[StatusBreakdown])
async def status_breakdown(
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[StatusBreakdown]:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        select(Application.status, func.count().label("count"))
        .where(Application.candidate_id == profile.id)
        .group_by(Application.status)
        .order_by(func.count().desc())
    )

    return [StatusBreakdown(status=r[0], count=r[1]) for r in result.all()]


@router.get("/activity", response_model=list[ActivityItem])
async def activity_feed(
    limit: int = 20,
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[ActivityItem]:
    profile = await _get_profile(db, current_user)

    result = await db.execute(
        select(Application, JobListing)
        .join(JobListing, Application.job_id == JobListing.id)
        .where(Application.candidate_id == profile.id)
        .order_by(Application.status_updated_at.desc())
        .limit(limit)
    )
    rows = result.all()

    return [
        ActivityItem(
            id=str(app.id),
            job_title=job.title,
            company=job.company,
            portal=app.portal,
            old_status="",
            new_status=app.status,
            timestamp=app.status_updated_at.isoformat(),
        )
        for app, job in rows
    ]


@router.get("/admin-stats", response_model=AdminDashboardData)
async def admin_dashboard(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardData:
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_candidates_result = await db.execute(select(func.count()).select_from(CandidateProfile))
    total_candidates = total_candidates_result.scalar() or 0

    active_auto_result = await db.execute(
        select(func.count()).where(
            CandidateProfile.auto_apply_enabled.is_(True),
            CandidateProfile.auto_apply_allowed.is_(True),
        )
    )
    active_auto_apply = active_auto_result.scalar() or 0

    today_apps_result = await db.execute(
        select(func.count()).where(Application.created_at >= today_start)
    )
    total_applications_today = today_apps_result.scalar() or 0

    total_apps_result = await db.execute(select(func.count()).select_from(Application))
    total_apps = total_apps_result.scalar() or 0

    success_apps_result = await db.execute(
        select(func.count()).where(
            Application.status.in_(["shortlisted", "interview"])
        )
    )
    success_apps = success_apps_result.scalar() or 0
    overall_success_rate = round((success_apps / total_apps * 100) if total_apps > 0 else 0.0, 2)

    since = now - timedelta(days=30)
    time_result = await db.execute(
        select(
            cast(Application.created_at, Date).label("date"),
            func.count().label("count"),
        )
        .where(Application.created_at >= since)
        .group_by(cast(Application.created_at, Date))
        .order_by(cast(Application.created_at, Date))
    )
    activity_over_time = [
        ChartDataPoint(date=str(r.date), count=r.count) for r in time_result.all()
    ]

    top_cand_result = await db.execute(
        select(
            CandidateProfile.id,
            CandidateProfile.full_name,
            func.count(Application.id).label("app_count"),
            func.count().filter(
                Application.status.in_(["shortlisted", "interview"])
            ).label("success_count"),
        )
        .outerjoin(Application, Application.candidate_id == CandidateProfile.id)
        .group_by(CandidateProfile.id, CandidateProfile.full_name)
        .order_by(func.count(Application.id).desc())
        .limit(10)
    )
    top_candidates = [
        AdminTopCandidate(
            id=str(r.id),
            full_name=r.full_name or "Unnamed",
            application_count=r.app_count,
            success_rate=round((r.success_count / r.app_count * 100) if r.app_count > 0 else 0.0, 1),
        )
        for r in top_cand_result.all()
    ]

    portal_result = await db.execute(
        select(
            Application.portal,
            func.count().label("total"),
            func.count().filter(
                Application.status.in_(["shortlisted", "interview"])
            ).label("success_count"),
        )
        .group_by(Application.portal)
        .order_by(func.count().desc())
    )
    portal_performance = [
        PortalPerformance(
            portal=r.portal,
            total=r.total,
            success_rate=round((r.success_count / r.total * 100) if r.total > 0 else 0.0, 1),
        )
        for r in portal_result.all()
    ]

    recent_result = await db.execute(
        select(Application, JobListing, CandidateProfile.full_name)
        .join(JobListing, Application.job_id == JobListing.id)
        .join(CandidateProfile, Application.candidate_id == CandidateProfile.id)
        .order_by(Application.created_at.desc())
        .limit(20)
    )
    recent_applications = [
        AdminRecentApplication(
            id=str(app.id),
            job_title=job.title,
            company=job.company,
            portal=app.portal,
            status=app.status,
            candidate_name=name or "Unnamed",
            applied_at=app.applied_at,
            created_at=app.created_at,
        )
        for app, job, name in recent_result.all()
    ]

    queue_depth_result = await db.execute(
        select(func.count()).where(Application.status.in_(["queued", "applying"]))
    )
    queue_depth = queue_depth_result.scalar() or 0

    return AdminDashboardData(
        stats=AdminStats(
            total_candidates=total_candidates,
            active_auto_apply=active_auto_apply,
            total_applications_today=total_applications_today,
            overall_success_rate=overall_success_rate,
        ),
        activity_over_time=activity_over_time,
        top_candidates=top_candidates,
        portal_performance=portal_performance,
        recent_applications=recent_applications,
        system_status=SystemStatus(
            active_workers=active_auto_apply,
            queue_depth=queue_depth,
            last_scrape_time=None,
        ),
    )
