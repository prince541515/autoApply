"""Submit a job application for a candidate (used by the API and Celery)."""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.core.security import decrypt_credentials
from app.models.application import Application
from app.models.candidate import CandidateProfile
from app.models.job import JobListing
from app.models.portal import PortalConnection
from app.models.user import User
from app.services.portal_adapters import get_adapter
from app.services.portal_adapters.base import ApplyResult
from app.services.rate_limiter import check_rate_limit, record_application

logger = logging.getLogger(__name__)


def _resume_path(stored: str | None) -> str | None:
    if not stored:
        return None
    path = Path(stored)
    if path.is_file():
        return str(path.resolve())
    return stored


async def _submit(adapter, credentials: dict, job_data: dict, candidate_data: dict) -> ApplyResult:
    if credentials:
        try:
            await adapter.authenticate(credentials)
        except Exception:
            logger.warning("Auth failed for %s before apply", adapter.portal_name)
    return await adapter.apply_to_job(job_data, candidate_data)


def apply_application(db: Session, application_id: str) -> dict:
    application = db.execute(
        select(Application).where(Application.id == application_id)
    ).scalar_one_or_none()
    if not application:
        return {"status": "failed", "message": "Application not found"}

    if application.status == "applied":
        return {"status": "applied", "message": "Already applied", "application_id": application_id}

    candidate = db.execute(
        select(CandidateProfile)
        .options(joinedload(CandidateProfile.user))
        .where(CandidateProfile.id == application.candidate_id)
    ).scalar_one_or_none()
    job = db.execute(select(JobListing).where(JobListing.id == application.job_id)).scalar_one_or_none()
    if not candidate or not job:
        application.status = "failed"
        application.apply_response = "Candidate or job not found"
        db.commit()
        return {"status": "failed", "message": "Candidate or job not found"}

    user = candidate.user
    if (
        not candidate.auto_apply_allowed
        or not user
        or not user.is_active
        or user.account_status != "active"
    ):
        application.status = "paused"
        application.apply_response = "Auto-apply not allowed or account is not active"
        db.commit()
        return {"status": "paused", "message": "Auto-apply is not allowed for this account"}

    portal_conn = db.execute(
        select(PortalConnection).where(
            PortalConnection.candidate_id == candidate.id,
            PortalConnection.portal == application.portal,
            PortalConnection.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if not portal_conn:
        application.status = "failed"
        application.apply_response = "No active portal connection"
        db.commit()
        return {"status": "failed", "message": f"Connect {application.portal} in Portals first"}

    try:
        allowed, retry_after = check_rate_limit(str(candidate.id), application.portal)
    except Exception:
        logger.warning("Rate limiter unavailable, allowing apply")
        allowed, retry_after = True, 0
    if not allowed:
        return {
            "status": "queued",
            "message": f"Rate limited on {application.portal}. Try again in {retry_after}s.",
            "application_id": application_id,
        }

    try:
        credentials = json.loads(decrypt_credentials(portal_conn.credentials_encrypted))
    except Exception as exc:
        application.status = "failed"
        application.apply_response = f"Failed to decrypt credentials: {exc}"
        db.commit()
        return {"status": "failed", "message": "Could not read portal credentials. Reconnect the portal."}

    user = None
    if candidate.user_id:
        user = db.execute(select(User).where(User.id == candidate.user_id)).scalar_one_or_none()

    resume = _resume_path(candidate.resume_url)
    job_data = {
        "external_id": job.external_id,
        "url": job.url,
        "title": job.title,
        "company": job.company,
        "description": job.description or "",
        "_credentials": credentials,
    }
    candidate_data = {
        "full_name": candidate.full_name,
        "email": user.email if user else "",
        "phone": candidate.phone or "",
        "location": candidate.location or "",
        "resume_url": resume or "",
        "resume_path": resume,
        "skills": candidate.skills or [],
    }

    application.status = "applying"
    db.commit()

    try:
        adapter = get_adapter(application.portal)
        result = asyncio.run(_submit(adapter, credentials, job_data, candidate_data))
    except Exception as exc:
        logger.exception("Apply failed for application %s", application_id)
        result = ApplyResult(success=False, message=str(exc))

    if result.success:
        application.status = "applied"
        application.applied_at = datetime.now(timezone.utc)
        application.external_app_id = result.external_app_id
        application.apply_response = result.message
        db.commit()
        record_application(str(candidate.id), application.portal)
        return {
            "status": "applied",
            "message": result.message or "Application submitted",
            "application_id": application_id,
            "method": result.method,
        }

    application.status = "failed"
    application.apply_response = result.message
    db.commit()
    return {
        "status": "failed",
        "message": result.message or "Application failed",
        "application_id": application_id,
    }


def create_and_apply_job(db: Session, candidate_id: str, job_id: str) -> dict:
    job = db.execute(
        select(JobListing).where(
            JobListing.id == job_id,
            JobListing.candidate_id == candidate_id,
        )
    ).scalar_one_or_none()
    if not job:
        return {"status": "failed", "message": "Job not found", "http_status": 404}

    existing = db.execute(
        select(Application).where(
            Application.candidate_id == candidate_id,
            Application.job_id == job_id,
        )
    ).scalar_one_or_none()

    if existing and existing.status == "applied":
        return {
            "status": "applied",
            "message": "Already applied to this job",
            "application_id": str(existing.id),
            "http_status": 409,
        }

    if existing and existing.status == "applying":
        return {
            "status": "applying",
            "message": "Application already in progress",
            "application_id": str(existing.id),
        }

    portal_conn = db.execute(
        select(PortalConnection).where(
            PortalConnection.candidate_id == candidate_id,
            PortalConnection.portal == job.portal,
            PortalConnection.is_active.is_(True),
        )
    ).scalar_one_or_none()
    if not portal_conn:
        return {
            "status": "failed",
            "message": f"No active connection for {job.portal}. Connect it in Portals first.",
            "http_status": 400,
        }

    if existing:
        existing.status = "queued"
        existing.apply_response = None
        db.commit()
        application_id = str(existing.id)
    else:
        application = Application(
            candidate_id=candidate_id,
            job_id=job_id,
            status="queued",
            portal=job.portal,
        )
        db.add(application)
        db.commit()
        db.refresh(application)
        application_id = str(application.id)

    result = apply_application(db, application_id)
    result["application_id"] = application_id
    return result
