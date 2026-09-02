from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.platform_settings import get_setting, get_setting_sync
from app.models.candidate import CandidateProfile

DAILY_SCRAPE_LIMIT_KEY = "daily_scrape_limit"
DEFAULT_DAILY_SCRAPE_LIMIT = 10
MIN_DAILY_SCRAPE_LIMIT = 1
MAX_DAILY_SCRAPE_LIMIT = 200


def clamp_daily_scrape_limit(value: object, fallback: int = DEFAULT_DAILY_SCRAPE_LIMIT) -> int:
    try:
        limit = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        limit = fallback
    return max(MIN_DAILY_SCRAPE_LIMIT, min(MAX_DAILY_SCRAPE_LIMIT, limit))


def utc_today() -> date:
    return datetime.now(timezone.utc).date()


def effective_daily_limit(profile_override: int | None, default_limit: int) -> int:
    if profile_override is None:
        return clamp_daily_scrape_limit(default_limit)
    return clamp_daily_scrape_limit(profile_override, default_limit)


def _reset_if_stale(profile: CandidateProfile) -> None:
    today = utc_today()
    if profile.scrape_quota_date != today:
        profile.scrape_quota_date = today
        profile.scrape_quota_used = 0


def quota_snapshot(profile: CandidateProfile, default_limit: int) -> dict:
    _reset_if_stale(profile)
    limit = effective_daily_limit(profile.daily_scrape_limit, default_limit)
    used = int(profile.scrape_quota_used or 0)
    remaining = max(0, limit - used)
    return {
        "limit": limit,
        "used": used,
        "remaining": remaining,
        "resets_at": datetime.combine(
            utc_today() + timedelta(days=1),
            datetime.min.time(),
            tzinfo=timezone.utc,
        ).isoformat().replace("+00:00", "Z"),
    }


def try_consume_scrape(profile: CandidateProfile, default_limit: int) -> dict | None:
    """Consume one scrape. Returns snapshot, or None if the daily cap is already hit."""
    snap = quota_snapshot(profile, default_limit)
    if snap["remaining"] <= 0:
        return None
    profile.scrape_quota_used = int(profile.scrape_quota_used or 0) + 1
    return quota_snapshot(profile, default_limit)


async def default_daily_limit(db: AsyncSession) -> int:
    raw = await get_setting(db, DAILY_SCRAPE_LIMIT_KEY, str(DEFAULT_DAILY_SCRAPE_LIMIT))
    return clamp_daily_scrape_limit(raw)


def default_daily_limit_sync(db: Session) -> int:
    raw = get_setting_sync(db, DAILY_SCRAPE_LIMIT_KEY, str(DEFAULT_DAILY_SCRAPE_LIMIT))
    return clamp_daily_scrape_limit(raw)
