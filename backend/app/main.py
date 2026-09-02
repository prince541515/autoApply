import asyncio
import logging
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, applications, auth, auto_apply, candidates, dashboard, jobs, portals, preferences
from app.core.config import settings
from app.core.database import ensure_schema

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def _db_host() -> str:
    url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
    return urlsplit(url).hostname or "unknown"


async def _init_schema() -> None:
    host = _db_host()
    if host in {"localhost", "127.0.0.1"}:
        logger.error(
            "DATABASE_URL points at %s. Add Railway Postgres and set "
            "DATABASE_URL=${{Postgres.DATABASE_URL}}",
            host,
        )
    for attempt in range(1, 16):
        try:
            await ensure_schema()
            logger.info("Schema ready (host=%s)", host)
            return
        except Exception:
            logger.exception("Database not ready (attempt %s/15, host=%s)", attempt, host)
            await asyncio.sleep(2)
    logger.error("Gave up initializing the database. /health still responds.")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("AutoApply API starting (db host=%s)", _db_host())
    task = asyncio.create_task(_init_schema())
    yield
    task.cancel()


app = FastAPI(
    title="AutoApply API",
    description="Job auto-application SaaS platform",
    version="1.0.0",
    lifespan=lifespan,
)

logger.info("CORS allow_origins=%s", settings.cors_origin_list)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(candidates.router)
app.include_router(portals.router)
app.include_router(preferences.router)
app.include_router(applications.router)
app.include_router(dashboard.router)
app.include_router(jobs.router, prefix="/jobs", tags=["jobs"])
app.include_router(auto_apply.router)
app.include_router(admin.router)


@app.get("/")
async def root() -> dict:
    return {"message": "AutoApply API", "version": "1.0.0"}


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "db_host": _db_host()}
