"""On-demand and periodic job scraping shared by the API and Celery."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.access import auto_apply_effective
from app.core.security import decrypt_credentials
from app.models.candidate import CandidateProfile
from app.models.job import JobListing
from app.models.portal import PortalConnection
from app.models.preference import JobPreference
from app.services.activity import record_activity_sync
from app.services.industry import (
    collect_industries,
    default_roles_for_industries,
)
from app.services.job_matcher import (
    MATCH_THRESHOLD,
    create_applications_for_matches,
    score_job_against_preferences,
)
from app.services.location_filter import job_matches_preferences, search_locations_from_prefs
from app.services.portal_adapters import ScrapedJob, get_adapter
from app.services.portal_adapters.public_search import (
    indeed_is_blocked,
    reset_indeed_block,
    search_linkedin_guest,
)

logger = logging.getLogger(__name__)

MAX_QUERIES = 8
JOBS_PER_QUERY = 15
SCRAPE_TIMEOUT_SECONDS = 45
PORTAL_SEARCH_TIMEOUT_SECONDS = 12
AUTH_TIMEOUT_SECONDS = 6


JOB_TYPE_SEARCH = {
    "full-time": "fulltime",
    "fulltime": "fulltime",
    "part-time": "parttime",
    "parttime": "parttime",
    "contract": "contract",
    "internship": "internship",
    "temporary": "temporary",
    "freelance": "contract",
    "night shift": "fulltime",
}


def _pref_search_extras(prefs: list[JobPreference]) -> dict:
    extras: dict = {}
    for pref in prefs:
        if pref.job_type:
            raw = pref.job_type.split(",")[0].strip().lower()
            extras["job_type"] = JOB_TYPE_SEARCH.get(raw, raw.replace("-", "").replace(" ", ""))
        if pref.work_mode:
            mode = pref.work_mode.strip().lower()
            extras["remote"] = mode == "remote"
            extras["work_mode"] = mode
        if pref.min_experience_years is not None:
            extras["min_experience_years"] = pref.min_experience_years
        if pref.max_experience_years is not None:
            extras["max_experience_years"] = pref.max_experience_years
        if getattr(pref, "include_fresher", False):
            extras["include_fresher"] = True
        if pref.min_salary is not None:
            extras["salary"] = pref.min_salary
            extras["salary_min"] = pref.min_salary
        if isinstance(pref.required_skills, list) and pref.required_skills:
            extras["skill_keywords"] = [
                s.strip() for s in pref.required_skills if isinstance(s, str) and s.strip()
            ][:3]
    from app.services.experience_filter import (
        linkedin_experience_filter,
        naukri_experience_filter,
    )

    extras["experience"] = naukri_experience_filter(
        extras.get("min_experience_years"),
        extras.get("max_experience_years"),
        include_fresher=bool(extras.get("include_fresher")),
    )
    extras["experience_level"] = linkedin_experience_filter(
        extras.get("min_experience_years"),
        extras.get("max_experience_years"),
        include_fresher=bool(extras.get("include_fresher")),
    )
    return extras


def _build_search_queries(prefs: list[JobPreference]) -> list[tuple[str, str]]:
    roles: list[str] = []
    for pref in prefs:
        if isinstance(pref.roles, list):
            roles.extend(r.strip() for r in pref.roles if isinstance(r, str) and r.strip())
    if not roles:
        roles = default_roles_for_industries(collect_industries(prefs))
    if any(getattr(pref, "include_fresher", False) for pref in prefs):
        from app.services.experience_filter import expand_roles_for_fresher

        roles = expand_roles_for_fresher(roles)
    roles = list(dict.fromkeys(roles))[:8]
    locations = search_locations_from_prefs(prefs)[:4]
    queries: list[tuple[str, str]] = []
    for location in locations:
        for role in roles:
            queries.append((role, location))
    unique: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in queries:
        if item not in seen:
            seen.add(item)
            unique.append(item)
    return unique[:MAX_QUERIES]


def _keywords_for_role(role: str, extras: dict) -> str:
    lower = role.lower()
    if extras.get("include_fresher") and any(
        token in lower for token in ("junior", "fresher", "trainee", "intern", "entry")
    ):
        return role
    skills = extras.get("skill_keywords") or []
    extra = " ".join(str(skill) for skill in skills[:2] if skill)
    return f"{role} {extra}".strip() if extra else role


def _store_jobs(db: Session, scraped: list[ScrapedJob], candidate_id) -> list[JobListing]:
    if not scraped:
        return []

    new_listings: list[JobListing] = []
    for sj in scraped:
        if not sj.external_id or not sj.title:
            continue
        existing = db.execute(
            select(JobListing).where(
                JobListing.candidate_id == candidate_id,
                JobListing.external_id == sj.external_id,
                JobListing.portal == sj.portal,
            )
        ).scalar_one_or_none()
        if existing:
            continue

        posted_at = None
        if sj.posted_at:
            try:
                posted_at = datetime.fromisoformat(str(sj.posted_at))
            except (ValueError, TypeError):
                posted_at = None

        listing = JobListing(
            candidate_id=candidate_id,
            external_id=sj.external_id,
            portal=sj.portal,
            title=sj.title,
            company=sj.company or "Unknown",
            location=sj.location,
            description=sj.description,
            salary_min=sj.salary_min,
            salary_max=sj.salary_max,
            url=sj.url or "",
            raw_data=sj.raw_data,
            posted_at=posted_at,
        )
        db.add(listing)
        new_listings.append(listing)

    if new_listings:
        db.commit()
        for listing in new_listings:
            db.refresh(listing)
    return new_listings


async def _search_portal(
    adapter,
    credentials: dict,
    queries: list[tuple[str, str]],
    extras: dict,
) -> list[ScrapedJob]:
    if credentials:
        try:
            await asyncio.wait_for(adapter.authenticate(credentials), timeout=AUTH_TIMEOUT_SECONDS)
        except Exception:
            logger.warning("Auth failed for %s, searching without a session", adapter.portal_name)

    allow_browser = bool(extras.get("allow_browser"))
    search_extras = {k: v for k, v in extras.items() if k != "allow_browser"}

    async def _one(role: str, location: str) -> list[ScrapedJob]:
        query = {
            "keywords": _keywords_for_role(role, extras),
            "location": location,
            "limit": JOBS_PER_QUERY,
            "allow_browser": allow_browser,
            **search_extras,
        }
        try:
            return await asyncio.wait_for(
                adapter.search_jobs(query),
                timeout=PORTAL_SEARCH_TIMEOUT_SECONDS,
            )
        except Exception:
            logger.exception("Error scraping %s query=%s", adapter.portal_name, role)
            return []

    batches = await asyncio.gather(*[_one(role, location) for role, location in queries])
    scraped: list[ScrapedJob] = []
    seen: set[tuple[str, str]] = set()
    for results in batches:
        for job in results:
            key = (job.external_id, job.portal)
            if key in seen:
                continue
            seen.add(key)
            scraped.append(job)
    return scraped


def _decrypt_creds(blob: str) -> dict:
    try:
        return json.loads(decrypt_credentials(blob))
    except Exception:
        return {}


def scrape_for_candidate(
    db: Session,
    candidate_id: str,
    portal_name: str | None = None,
    posted_within_hours: int | None = None,
    source: str = "scheduled",
) -> dict:
    posted_within_hours = int(posted_within_hours) if posted_within_hours else 24
    candidate = db.execute(
        select(CandidateProfile)
        .options(joinedload(CandidateProfile.user))
        .where(CandidateProfile.id == candidate_id)
    ).scalar_one_or_none()
    if not candidate:
        return {"error": "Candidate not found", "new_jobs": 0}

    user = candidate.user
    if not user or not user.is_active or user.account_status != "active":
        return {"error": "Account is not active", "new_jobs": 0}

    conn_query = select(PortalConnection).where(
        PortalConnection.candidate_id == candidate.id,
        PortalConnection.is_active.is_(True),
    )
    if portal_name:
        conn_query = conn_query.where(PortalConnection.portal == portal_name)
    connections = db.execute(conn_query).scalars().all()
    if not connections:
        return {"error": "No active portal connections", "new_jobs": 0}

    prefs = (
        db.execute(select(JobPreference).where(JobPreference.candidate_id == candidate.id))
        .scalars()
        .all()
    )
    roles = [
        role
        for pref in prefs
        if isinstance(pref.roles, list)
        for role in pref.roles
        if isinstance(role, str) and role.strip()
    ]
    locations = search_locations_from_prefs(prefs)
    industry = collect_industries(prefs)
    if not roles:
        roles = default_roles_for_industries(industry)
    if not roles:
        return {"error": "Set target roles or an industry in Preferences before scraping", "new_jobs": 0}
    if not locations:
        return {"error": "Set a country or state in Preferences before scraping", "new_jobs": 0}

    if "Any" not in industry and "Technology" not in industry:
        connections = [c for c in connections if c.portal != "wellfound"]
        if not connections:
            return {
                "error": "Wellfound is startup/tech-focused. Connect LinkedIn, Naukri, or Indeed for this role.",
                "new_jobs": 0,
            }

    queries = _build_search_queries(prefs)
    extras = _pref_search_extras(prefs)
    extras["allow_browser"] = False
    if posted_within_hours:
        extras["posted_within_hours"] = int(posted_within_hours)

    reset_indeed_block()

    total_new = 0
    all_new_jobs: list[JobListing] = []
    portal_lookup: dict[str, str] = {}

    async def _scrape_one(conn: PortalConnection) -> tuple[PortalConnection, list[ScrapedJob]]:
        try:
            adapter = get_adapter(conn.portal)
        except ValueError:
            logger.warning("No adapter for portal %s", conn.portal)
            return conn, []
        credentials = _decrypt_creds(conn.credentials_encrypted)
        jobs = await _search_portal(adapter, credentials, queries, extras)
        return conn, jobs

    async def _linkedin_guest() -> list[ScrapedJob]:
        collected: list[ScrapedJob] = []
        seen: set[str] = set()
        batches = await asyncio.gather(
            *[
                search_linkedin_guest(
                    _keywords_for_role(role, extras),
                    location,
                    JOBS_PER_QUERY,
                    within_hours=posted_within_hours,
                )
                for role, location in queries[:MAX_QUERIES]
            ],
            return_exceptions=True,
        )
        for batch in batches:
            if isinstance(batch, Exception):
                logger.warning("LinkedIn guest search failed: %s", batch)
                continue
            for job in batch:
                if job.external_id in seen:
                    continue
                seen.add(job.external_id)
                collected.append(job)
        return collected

    async def _scrape_all() -> tuple[list[tuple[PortalConnection, list[ScrapedJob]]], list[ScrapedJob]]:
        portal_task = asyncio.gather(
            *[_scrape_one(conn) for conn in connections],
            return_exceptions=True,
        )
        guest_task = asyncio.create_task(_linkedin_guest())
        results = await portal_task
        pairs: list[tuple[PortalConnection, list[ScrapedJob]]] = []
        for item in results:
            if isinstance(item, Exception):
                logger.exception("Portal scrape failed: %s", item)
                continue
            pairs.append(item)
        try:
            guest_jobs = await asyncio.wait_for(guest_task, timeout=18)
        except Exception:
            guest_jobs = []
        return pairs, guest_jobs

    try:
        scraped_by_portal, guest_jobs = asyncio.run(
            asyncio.wait_for(_scrape_all(), timeout=SCRAPE_TIMEOUT_SECONDS)
        )
    except TimeoutError:
        logger.warning("Scrape hit %ss deadline; saving whatever finished", SCRAPE_TIMEOUT_SECONDS)
        scraped_by_portal, guest_jobs = [], []

    for conn, scraped in scraped_by_portal:
        before = len(scraped)
        kept = [job for job in scraped if job_matches_preferences(job, prefs)]
        logger.info(
            "scrape %s: %d fetched, %d kept after preferences",
            conn.portal,
            before,
            len(kept),
        )
        new_jobs = _store_jobs(db, kept, candidate.id)
        for job in new_jobs:
            portal_lookup[str(job.id)] = job.portal
        all_new_jobs.extend(new_jobs)
        total_new += len(new_jobs)
        conn.last_synced = datetime.now(timezone.utc)
        db.commit()

    guest_kept = [job for job in guest_jobs if job_matches_preferences(job, prefs)]
    logger.info(
        "LinkedIn guest fallback %d fetched, %d kept after preferences",
        len(guest_jobs),
        len(guest_kept),
    )
    guest_jobs = guest_kept
    if guest_jobs:
        new_jobs = _store_jobs(db, guest_jobs, candidate.id)
        for job in new_jobs:
            portal_lookup[str(job.id)] = job.portal
        all_new_jobs.extend(new_jobs)
        total_new += len(new_jobs)

    if total_new == 0 and indeed_is_blocked():
        return {
            "error": (
                "Indeed blocked this server (403). Connect LinkedIn or try again later. "
                "Indeed does not allow datacenter scraping."
            ),
            "new_jobs": 0,
        }

    if all_new_jobs and auto_apply_effective(candidate):
        matches = [
            (str(candidate.id), str(job.id), score)
            for job in all_new_jobs
            if (score := score_job_against_preferences(
                job,
                prefs,
                extra_skills=candidate.skills if isinstance(candidate.skills, list) else None,
            )) >= MATCH_THRESHOLD
        ]
        apps = create_applications_for_matches(matches, db, portal_lookup)
        from app.workers.auto_apply import apply_to_job

        for app in apps:
            record_activity_sync(
                db,
                user_id=candidate.user_id,
                candidate_id=candidate.id,
                event_type="auto_apply",
                metadata={"application_id": str(app.id), "job_id": str(app.job_id)},
            )
            apply_to_job.delay(str(app.id))

    record_activity_sync(
        db,
        user_id=candidate.user_id,
        candidate_id=candidate.id,
        event_type="job_fetch",
        metadata={"jobs_found": total_new, "source": source, "portal": portal_name},
    )

    return {"new_jobs": total_new}
