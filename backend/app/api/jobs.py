"""Jobs API router — list scraped jobs, matched jobs, and trigger on-demand scrapes."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import defer

from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import require_active_candidate
from app.models.application import Application
from app.models.candidate import CandidateProfile
from app.models.job import JobListing
from app.models.preference import JobPreference
from app.models.user import User
from app.services.job_matcher import flatten_preferences, score_job_with_flat_prefs
from app.services.location_filter import build_preference_filter, job_matches_pref_filter

router = APIRouter()


class JobListingResponse(BaseModel):
    id: UUID
    external_id: str
    portal: str
    title: str
    company: str
    location: str | None
    description: str | None
    salary_min: int | None
    salary_max: int | None
    url: str
    posted_at: datetime | None
    scraped_at: datetime

    model_config = {"from_attributes": True}


class MatchedJobResponse(BaseModel):
    id: UUID
    external_id: str
    portal: str
    title: str
    company: str
    location: str | None
    description: str | None
    salary_min: int | None
    salary_max: int | None
    url: str
    posted_at: datetime | None
    scraped_at: datetime
    match_score: float
    application_status: str | None

    model_config = {"from_attributes": True}


class JobListResponse(BaseModel):
    jobs: list[JobListingResponse]
    total: int


class MatchedJobListResponse(BaseModel):
    jobs: list[MatchedJobResponse]
    total: int


class ScrapeResponse(BaseModel):
    message: str
    task_id: str | None = None
    new_jobs: int = 0
    remaining: int | None = None
    limit: int | None = None
    used: int | None = None


class ScrapeQuotaResponse(BaseModel):
    limit: int
    used: int
    remaining: int
    resets_at: str


async def _get_profile(db: AsyncSession, user: User) -> CandidateProfile:
    return await get_or_create_candidate_profile(db, user)


@router.get("/", response_model=JobListResponse)
async def list_jobs(
    portal: str | None = None,
    company: str | None = None,
    location: str | None = None,
    search: str | None = None,
    from_date: datetime | None = None,
    to_date: datetime | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> JobListResponse:
    query = select(JobListing).order_by(JobListing.scraped_at.desc())

    if portal:
        query = query.where(JobListing.portal == portal)
    if company:
        query = query.where(JobListing.company.ilike(f"%{company}%"))
    if location:
        query = query.where(JobListing.location.ilike(f"%{location}%"))
    if search:
        pattern = f"%{search}%"
        query = query.where(
            (JobListing.title.ilike(pattern)) | (JobListing.company.ilike(pattern))
        )
    if from_date:
        query = query.where(JobListing.scraped_at >= from_date)
    if to_date:
        query = query.where(JobListing.scraped_at <= to_date)

    count_q = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_q)
    total = total_result.scalar() or 0

    result = await db.execute(query.limit(limit).offset(offset))
    jobs = list(result.scalars().all())

    return JobListResponse(
        jobs=[JobListingResponse.model_validate(j) for j in jobs],
        total=total,
    )


@router.get("/matched", response_model=MatchedJobListResponse)
async def get_matched_jobs(
    min_score: float = Query(0.0, ge=0.0, le=1.0),
    max_score: float = Query(1.0, ge=0.0, le=1.0),
    portal: str | None = None,
    search: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> MatchedJobListResponse:
    profile = await _get_profile(db, current_user)
    prefs = list(
        (await db.execute(select(JobPreference).where(JobPreference.candidate_id == profile.id)))
        .scalars()
        .all()
    )

    query = (
        select(JobListing)
        .options(defer(JobListing.raw_data))
        .order_by(JobListing.scraped_at.desc())
    )
    if portal:
        query = query.where(JobListing.portal == portal)
    if search:
        pattern = f"%{search}%"
        query = query.where(
            (JobListing.title.ilike(pattern)) | (JobListing.company.ilike(pattern))
        )

    result = await db.execute(query.limit(300))
    listings = list(result.scalars().all())

    app_rows = await db.execute(
        select(Application.job_id, Application.status).where(Application.candidate_id == profile.id)
    )
    status_by_job = {row[0]: row[1] for row in app_rows.all()}

    HIDDEN_STATUSES = {
        "applied",
        "viewed",
        "shortlisted",
        "interview",
        "withdrawn",
        "removed",
    }
    extra_skills = profile.skills if isinstance(profile.skills, list) else None
    flat_prefs = flatten_preferences(prefs, extra_skills)
    pref_filter = build_preference_filter(prefs)

    scored: list[tuple[float, JobListing]] = []
    for job in listings:
        if status_by_job.get(job.id) in HIDDEN_STATUSES:
            continue
        if prefs and not job_matches_pref_filter(job, pref_filter):
            continue
        score = score_job_with_flat_prefs(job, flat_prefs, use_description=False)
        if min_score <= score <= max_score:
            scored.append((score, job))
    scored.sort(key=lambda item: item[0], reverse=True)
    total = len(scored)
    page = scored[offset : offset + limit]

    matched_jobs = [
        MatchedJobResponse(
            id=job.id,
            external_id=job.external_id,
            portal=job.portal,
            title=job.title,
            company=job.company,
            location=job.location,
            description=None,
            salary_min=job.salary_min,
            salary_max=job.salary_max,
            url=job.url,
            posted_at=job.posted_at,
            scraped_at=job.scraped_at,
            match_score=round(score, 3),
            application_status=status_by_job.get(job.id),
        )
        for score, job in page
    ]

    return MatchedJobListResponse(jobs=matched_jobs, total=total)


@router.get("/scrape-quota", response_model=ScrapeQuotaResponse)
async def get_scrape_quota(
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> ScrapeQuotaResponse:
    from app.core.scrape_quota import default_daily_limit, quota_snapshot

    profile = await _get_profile(db, current_user)
    snap = quota_snapshot(profile, await default_daily_limit(db))
    return ScrapeQuotaResponse(**snap)


@router.get("/{job_id}", response_model=JobListingResponse)
async def get_job(
    job_id: UUID,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> JobListingResponse:
    result = await db.execute(
        select(JobListing)
        .options(defer(JobListing.raw_data))
        .where(JobListing.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return JobListingResponse.model_validate(job)


@router.post("/scrape-now", response_model=ScrapeResponse)
async def trigger_scrape(
    portal: str | None = None,
    posted_within_hours: int | None = Query(None, ge=1, le=744),
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> ScrapeResponse:
    import asyncio

    from app.core.scrape_quota import default_daily_limit, quota_snapshot, try_consume_scrape
    from app.core.sync_database import get_sync_db
    from app.services.scraper import scrape_for_candidate

    locked = await db.execute(
        select(CandidateProfile)
        .where(CandidateProfile.user_id == current_user.id)
        .with_for_update()
    )
    profile = locked.scalar_one_or_none()
    if not profile:
        profile = await _get_profile(db, current_user)

    default_limit = await default_daily_limit(db)
    consumed = try_consume_scrape(profile, default_limit)
    if consumed is None:
        snap = quota_snapshot(profile, default_limit)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                "code": "scrape_quota_exceeded",
                "message": "Daily scrape limit reached. Contact an admin to upgrade your plan.",
                **snap,
            },
        )

    await db.flush()
    candidate_id = str(profile.id)

    def _run() -> dict:
        sync_db = get_sync_db()
        try:
            return scrape_for_candidate(sync_db, candidate_id, portal, posted_within_hours, source="scrape_now")
        finally:
            sync_db.close()

    result = await asyncio.to_thread(_run)
    if result.get("error"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result["error"])

    new_jobs = int(result.get("new_jobs") or 0)
    return ScrapeResponse(
        message=f"Found {new_jobs} new job{'s' if new_jobs != 1 else ''}",
        new_jobs=new_jobs,
        remaining=consumed["remaining"],
        limit=consumed["limit"],
        used=consumed["used"],
    )
