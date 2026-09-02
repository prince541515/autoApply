"""Redis-backed sliding-window rate limiter for job applications."""

from __future__ import annotations

import logging
import time

import redis

from app.core.config import settings

logger = logging.getLogger(__name__)

PORTAL_LIMITS: dict[str, dict[str, int]] = {
    "linkedin": {"per_hour": 5, "per_day": 25},
    "naukri": {"per_hour": 10, "per_day": 50},
    "indeed": {"per_hour": 6, "per_day": 30},
    "wellfound": {"per_hour": 4, "per_day": 20},
}

DEFAULT_LIMITS = {"per_hour": 5, "per_day": 25}

HOUR_SECONDS = 3600
DAY_SECONDS = 86400

_redis_client: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.Redis.from_url(
            settings.REDIS_URL, decode_responses=True
        )
    return _redis_client


def _sorted_set_key(candidate_id: str, portal: str, window: str) -> str:
    return f"ratelimit:{candidate_id}:{portal}:{window}"


def check_rate_limit(
    candidate_id: str, portal: str
) -> tuple[bool, int]:
    """Check whether the candidate may apply on this portal right now.

    Returns ``(allowed, retry_after_seconds)``.  ``retry_after`` is 0 when
    allowed, otherwise the number of seconds to wait before re-checking.
    """
    r = _get_redis()
    now = time.time()
    limits = PORTAL_LIMITS.get(portal.lower(), DEFAULT_LIMITS)

    hourly_key = _sorted_set_key(candidate_id, portal, "hour")
    daily_key = _sorted_set_key(candidate_id, portal, "day")

    pipe = r.pipeline()
    pipe.zremrangebyscore(hourly_key, "-inf", now - HOUR_SECONDS)
    pipe.zremrangebyscore(daily_key, "-inf", now - DAY_SECONDS)
    pipe.zcard(hourly_key)
    pipe.zcard(daily_key)
    _, _, hourly_count, daily_count = pipe.execute()

    if daily_count >= limits["per_day"]:
        oldest_daily = r.zrange(daily_key, 0, 0, withscores=True)
        if oldest_daily:
            retry_after = int(DAY_SECONDS - (now - oldest_daily[0][1])) + 1
        else:
            retry_after = DAY_SECONDS
        logger.info(
            "Daily rate limit hit for candidate=%s portal=%s (%d/%d)",
            candidate_id, portal, daily_count, limits["per_day"],
        )
        return False, max(retry_after, 1)

    if hourly_count >= limits["per_hour"]:
        oldest_hourly = r.zrange(hourly_key, 0, 0, withscores=True)
        if oldest_hourly:
            retry_after = int(HOUR_SECONDS - (now - oldest_hourly[0][1])) + 1
        else:
            retry_after = HOUR_SECONDS
        logger.info(
            "Hourly rate limit hit for candidate=%s portal=%s (%d/%d)",
            candidate_id, portal, hourly_count, limits["per_hour"],
        )
        return False, max(retry_after, 1)

    return True, 0


def record_application(candidate_id: str, portal: str) -> None:
    """Record that an application was just submitted."""
    r = _get_redis()
    now = time.time()
    member = f"{now}"

    hourly_key = _sorted_set_key(candidate_id, portal, "hour")
    daily_key = _sorted_set_key(candidate_id, portal, "day")

    pipe = r.pipeline()
    pipe.zadd(hourly_key, {member: now})
    pipe.zadd(daily_key, {member: now})
    pipe.expire(hourly_key, HOUR_SECONDS + 60)
    pipe.expire(daily_key, DAY_SECONDS + 60)
    pipe.execute()


def get_current_counts(candidate_id: str, portal: str) -> dict[str, int]:
    """Return current application counts in each window."""
    r = _get_redis()
    now = time.time()

    hourly_key = _sorted_set_key(candidate_id, portal, "hour")
    daily_key = _sorted_set_key(candidate_id, portal, "day")

    pipe = r.pipeline()
    pipe.zremrangebyscore(hourly_key, "-inf", now - HOUR_SECONDS)
    pipe.zremrangebyscore(daily_key, "-inf", now - DAY_SECONDS)
    pipe.zcard(hourly_key)
    pipe.zcard(daily_key)
    _, _, hourly, daily = pipe.execute()

    return {"hourly": hourly, "daily": daily}


def get_all_rate_limit_status(candidate_id: str) -> dict[str, dict]:
    """Return rate limit status for all portals."""
    result = {}
    for portal, limits in PORTAL_LIMITS.items():
        counts = get_current_counts(candidate_id, portal)
        allowed, retry_after = check_rate_limit(candidate_id, portal)
        result[portal] = {
            "hourly_used": counts["hourly"],
            "hourly_limit": limits["per_hour"],
            "daily_used": counts["daily"],
            "daily_limit": limits["per_day"],
            "allowed": allowed,
            "retry_after_seconds": retry_after,
        }
    return result
