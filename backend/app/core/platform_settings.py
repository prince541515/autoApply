from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.platform_setting import PlatformSetting

BEAT_INTERVAL_KEY = "beat_scrape_interval_minutes"
DEFAULT_BEAT_MINUTES = 15
MIN_BEAT_MINUTES = 5
MAX_BEAT_MINUTES = 24 * 60


def clamp_beat_minutes(value: object, fallback: int = DEFAULT_BEAT_MINUTES) -> int:
    try:
        minutes = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        minutes = fallback
    return max(MIN_BEAT_MINUTES, min(MAX_BEAT_MINUTES, minutes))


def effective_beat_minutes(profile_override: int | None, default_minutes: int) -> int:
    if profile_override is None:
        return clamp_beat_minutes(default_minutes)
    return clamp_beat_minutes(profile_override, default_minutes)


async def get_setting(db: AsyncSession, key: str, default: str) -> str:
    row = (await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))).scalar_one_or_none()
    return row.value if row else default


async def set_setting(db: AsyncSession, key: str, value: str) -> str:
    row = (await db.execute(select(PlatformSetting).where(PlatformSetting.key == key))).scalar_one_or_none()
    if row is None:
        row = PlatformSetting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    await db.flush()
    return row.value


def get_setting_sync(db: Session, key: str, default: str) -> str:
    row = db.execute(select(PlatformSetting).where(PlatformSetting.key == key)).scalar_one_or_none()
    return row.value if row else default


def default_beat_minutes_sync(db: Session) -> int:
    return clamp_beat_minutes(get_setting_sync(db, BEAT_INTERVAL_KEY, str(DEFAULT_BEAT_MINUTES)))
