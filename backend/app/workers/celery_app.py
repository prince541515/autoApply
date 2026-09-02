from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "autoapply",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)

if settings.REDIS_URL.startswith("rediss://"):
    import ssl

    celery_app.conf.broker_use_ssl = {"ssl_cert_reqs": ssl.CERT_REQUIRED}
    celery_app.conf.redis_backend_use_ssl = {"ssl_cert_reqs": ssl.CERT_REQUIRED}

celery_app.autodiscover_tasks(["app.workers"])

celery_app.conf.beat_schedule = {
    "scrape-all-portals": {
        "task": "app.workers.scrape_jobs.scrape_all_portals",
        "schedule": 60,  # tick each minute; per-candidate interval is in the task
    },
    "check-application-statuses": {
        "task": "app.workers.check_status.check_application_statuses",
        "schedule": 60 * 60,  # every 1 hour
    },
}
