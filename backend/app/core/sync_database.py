"""Synchronous SQLAlchemy engine/session for Celery workers."""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings
from app.core.db_urls import database_needs_ssl, to_sync_database_url

_sync_url = to_sync_database_url(settings.DATABASE_URL)
_is_neon_pooler = "-pooler." in _sync_url
_connect_args: dict = {}
if database_needs_ssl(settings.DATABASE_URL):
    _connect_args["sslmode"] = "require"

_engine_kwargs: dict = {
    "echo": False,
    "connect_args": _connect_args,
}
if _is_neon_pooler:
    _engine_kwargs["poolclass"] = NullPool
else:
    _engine_kwargs.update(pool_pre_ping=True, pool_recycle=300)

sync_engine = create_engine(_sync_url, **_engine_kwargs)

SyncSessionFactory = sessionmaker(bind=sync_engine, class_=Session, expire_on_commit=False)


def get_sync_db() -> Session:
    return SyncSessionFactory()
