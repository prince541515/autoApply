import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import admin, applications, auth, auto_apply, candidates, dashboard, jobs, portals, preferences
from app.core.config import settings
from app.core.database import ensure_schema

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AutoApply API",
    description="Job auto-application SaaS platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
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


@app.on_event("startup")
async def startup_event() -> None:
    logger.info("AutoApply API starting up")
    await ensure_schema()
    logger.info("Schema ready")


@app.get("/")
async def root() -> dict:
    return {"message": "AutoApply API", "version": "1.0.0"}


@app.get("/health")
async def health() -> dict:
    return {"ok": True}
