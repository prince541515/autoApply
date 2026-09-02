"""Celery tasks for scraping job listings from connected portals."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.platform_settings import default_beat_minutes_sync, effective_beat_minutes
from app.core.scrape_quota import default_daily_limit_sync, try_consume_scrape
from app.core.sync_database import get_sync_db
from app.models.candidate import CandidateProfile
from app.models.portal import PortalConnection
from app.models.user import User
from app.services.scraper import scrape_for_candidate
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="app.workers.scrape_jobs.scrape_all_portals", bind=True)
def scrape_all_portals(self):
    """Periodic scrape only for candidates with Auto-Apply allowed and on."""
    db = get_sync_db()
    try:
        default_minutes = default_beat_minutes_sync(db)
        default_limit = default_daily_limit_sync(db)
        now = datetime.now(timezone.utc)
        rows = (
            db.execute(
                select(CandidateProfile)
                .join(PortalConnection, PortalConnection.candidate_id == CandidateProfile.id)
                .join(User, User.id == CandidateProfile.user_id)
                .where(
                    PortalConnection.is_active.is_(True),
                    CandidateProfile.auto_apply_allowed.is_(True),
                    CandidateProfile.auto_apply_enabled.is_(True),
                    User.account_status == "active",
                    User.is_active.is_(True),
                )
                .distinct()
            )
            .scalars()
            .all()
        )

        scraped = 0
        skipped = 0
        total_new = 0
        for profile in rows:
            interval = effective_beat_minutes(profile.beat_scrape_interval_minutes, default_minutes)
            last = profile.last_beat_scrape_at
            if last is not None:
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                elapsed = (now - last).total_seconds() / 60
                if elapsed < interval:
                    skipped += 1
                    continue
            if try_consume_scrape(profile, default_limit) is None:
                skipped += 1
                continue
            result = scrape_for_candidate(db, str(profile.id), source="beat")
            total_new += int(result.get("new_jobs") or 0)
            profile.last_beat_scrape_at = datetime.now(timezone.utc)
            db.commit()
            scraped += 1

        logger.info(
            "beat scrape: %d due, %d skipped (not due), %d new jobs (default %d min)",
            scraped,
            skipped,
            total_new,
            default_minutes,
        )
        return {"scraped": scraped, "skipped": skipped, "new_jobs": total_new}
    finally:
        db.close()


@celery_app.task(name="app.workers.scrape_jobs.scrape_portal_for_candidate", bind=True)
def scrape_portal_for_candidate(
    self,
    candidate_id: str,
    portal_name: str | None = None,
    posted_within_hours: int | None = None,
):
    """On-demand scrape for a single candidate, optionally filtered to one portal."""
    db = get_sync_db()
    try:
        result = scrape_for_candidate(db, candidate_id, portal_name, posted_within_hours)
        if result.get("error"):
            logger.error("Scrape failed for %s: %s", candidate_id, result["error"])
        return result
    finally:
        db.close()
