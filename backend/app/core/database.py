from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings
from app.core.db_urls import database_needs_ssl

# Neon pooler (PgBouncer) rejects prepared statements; disable the asyncpg cache.
_is_neon_pooler = "-pooler." in settings.DATABASE_URL
_connect_args: dict = {}
if _is_neon_pooler:
    _connect_args["statement_cache_size"] = 0
if database_needs_ssl(settings.DATABASE_URL):
    _connect_args["ssl"] = True
_connect_args["timeout"] = 10

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    pool_pre_ping=not _is_neon_pooler,
    pool_size=5,
    max_overflow=10,
    connect_args=_connect_args,
)


async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def ensure_schema() -> None:
    """Create missing tables and columns for SaaS gating without a full migration."""
    import app.models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "account_status VARCHAR(20) NOT NULL DEFAULT 'active'"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "email_verified BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_hash VARCHAR(64)")
        )
        await conn.execute(
            text(
                "ALTER TABLE users ADD COLUMN IF NOT EXISTS "
                "otp_attempts INTEGER NOT NULL DEFAULT 0"
            )
        )
        await conn.execute(
            text("ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ")
        )
        await conn.execute(
            text(
                """
                INSERT INTO users (
                    email, password_hash, role, account_status, is_active,
                    email_verified, otp_hash, otp_attempts, otp_expires_at
                )
                SELECT
                    s.email, s.password_hash, 'candidate', 'pending', true,
                    false, s.otp_hash, s.attempts, s.expires_at
                FROM email_signups s
                WHERE NOT EXISTS (
                    SELECT 1 FROM users u WHERE lower(u.email) = lower(s.email)
                )
                """
            )
        )
        await conn.execute(
            text(
                """
                UPDATE users SET email_verified = true
                WHERE otp_hash IS NULL
                """
            )
        )
        await conn.execute(
            text(
                """
                INSERT INTO candidate_profiles (user_id, full_name)
                SELECT u.id, split_part(u.email, '@', 1)
                FROM users u
                WHERE u.role = 'candidate'
                  AND NOT EXISTS (
                    SELECT 1 FROM candidate_profiles p WHERE p.user_id = u.id
                  )
                """
            )
        )
        await conn.execute(
            text(
                """
                DELETE FROM email_signups s
                WHERE EXISTS (
                    SELECT 1 FROM users u WHERE lower(u.email) = lower(s.email)
                )
                """
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "
                "auto_apply_allowed BOOLEAN NOT NULL DEFAULT false"
            )
        )
        await conn.execute(
            text(
                "UPDATE candidate_profiles SET auto_apply_allowed = true "
                "WHERE auto_apply_enabled = true AND auto_apply_allowed = false"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE job_preferences ADD COLUMN IF NOT EXISTS "
                "industry VARCHAR(255)"
            )
        )
        await conn.execute(
            text("ALTER TABLE job_preferences ALTER COLUMN industry TYPE VARCHAR(255)")
        )
        await conn.execute(
            text("ALTER TABLE job_preferences ALTER COLUMN job_type TYPE VARCHAR(80)")
        )
        await conn.execute(
            text(
                "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "
                "beat_scrape_interval_minutes INTEGER"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "
                "last_beat_scrape_at TIMESTAMPTZ"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "
                "daily_scrape_limit INTEGER"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "
                "scrape_quota_date DATE"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE candidate_profiles ADD COLUMN IF NOT EXISTS "
                "scrape_quota_used INTEGER NOT NULL DEFAULT 0"
            )
        )
        await conn.execute(
            text(
                "ALTER TABLE job_listings ADD COLUMN IF NOT EXISTS "
                "candidate_id UUID REFERENCES candidate_profiles(id) ON DELETE CASCADE"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_job_listings_candidate_id "
                "ON job_listings (candidate_id)"
            )
        )
        await conn.execute(
            text("ALTER TABLE job_listings DROP CONSTRAINT IF EXISTS uq_job_external_portal")
        )
        await conn.execute(
            text(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS uq_candidate_job_external_portal
                ON job_listings (candidate_id, external_id, portal)
                WHERE candidate_id IS NOT NULL
                """
            )
        )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
