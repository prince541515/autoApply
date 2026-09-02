"""Celery tasks for auto-applying to jobs with rate limiting and browser fallback."""

from __future__ import annotations

import logging
import random

from sqlalchemy import select

from app.core.sync_database import get_sync_db
from app.models.application import Application
from app.services.applier import apply_application
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
BASE_RETRY_DELAY = 60


@celery_app.task(
    name="app.workers.auto_apply.apply_to_job",
    bind=True,
    max_retries=MAX_RETRIES,
    default_retry_delay=BASE_RETRY_DELAY,
    acks_late=True,
)
def apply_to_job(self, application_id: str):
    """Apply to a single job on behalf of a candidate."""
    db = get_sync_db()
    try:
        result = apply_application(db, application_id)
        if result.get("status") == "failed" and self.request.retries < MAX_RETRIES:
            application = db.execute(
                select(Application).where(Application.id == application_id)
            ).scalar_one_or_none()
            if application and application.status != "applied":
                application.status = "queued"
                db.commit()
            countdown = BASE_RETRY_DELAY * (2 ** self.request.retries)
            raise self.retry(exc=Exception(result.get("message") or "Apply failed"), countdown=countdown)
        return result
    except self.MaxRetriesExceededError:
        try:
            application = db.execute(
                select(Application).where(Application.id == application_id)
            ).scalar_one_or_none()
            if application and application.status != "applied":
                application.status = "failed"
                application.apply_response = "Max retries exceeded"
                db.commit()
        except Exception:
            logger.exception("Failed to mark application %s as failed after max retries", application_id)
        return {"status": "failed", "message": "Max retries exceeded"}
    finally:
        db.close()


@celery_app.task(
    name="app.workers.auto_apply.batch_apply",
    bind=True,
)
def batch_apply(self, application_ids: list[str]):
    """Fan out individual apply_to_job tasks with staggered delays."""
    if not application_ids:
        return {"status": "no_applications", "count": 0}

    dispatched = []
    for i, app_id in enumerate(application_ids):
        delay = i * random.randint(2, 5)
        apply_to_job.apply_async(args=[app_id], countdown=delay)
        dispatched.append({"application_id": app_id, "delay_seconds": delay})
        logger.info("Dispatched apply_to_job for %s with %ds delay", app_id, delay)

    logger.info("Batch dispatched %d applications", len(dispatched))
    return {"status": "dispatched", "count": len(dispatched), "tasks": dispatched}
