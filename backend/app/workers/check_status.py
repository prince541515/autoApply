"""Celery task for periodically checking application statuses."""

from __future__ import annotations

import logging
from collections import defaultdict

from sqlalchemy import select

from app.core.sync_database import get_sync_db
from app.models.application import Application
from app.models.portal import PortalConnection
from app.services.portal_adapters import get_adapter
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

TRACKABLE_STATUSES = ("applied", "viewed")


@celery_app.task(name="app.workers.check_status.check_application_statuses", bind=True)
def check_application_statuses(self):
    """Check the status of all in-flight applications and update the DB."""
    db = get_sync_db()
    try:
        applications = (
            db.execute(
                select(Application).where(Application.status.in_(TRACKABLE_STATUSES))
            )
            .scalars()
            .all()
        )

        if not applications:
            logger.info("No applications to check")
            return {"checked": 0, "updated": 0}

        by_portal: dict[str, list[Application]] = defaultdict(list)
        for app in applications:
            by_portal[app.portal].append(app)

        checked = 0
        updated = 0

        for portal_name, apps in by_portal.items():
            try:
                adapter = get_adapter(portal_name)
            except ValueError:
                logger.warning("No adapter for portal %s, skipping %d apps", portal_name, len(apps))
                continue

            candidate_conns: dict[str, PortalConnection | None] = {}

            for app in apps:
                cid = str(app.candidate_id)
                if cid not in candidate_conns:
                    conn = db.execute(
                        select(PortalConnection).where(
                            PortalConnection.candidate_id == app.candidate_id,
                            PortalConnection.portal == portal_name,
                            PortalConnection.is_active.is_(True),
                        )
                    ).scalar_one_or_none()
                    candidate_conns[cid] = conn

                conn = candidate_conns[cid]
                if not conn or not app.external_app_id:
                    continue

                try:
                    result = adapter.check_application_status(
                        credentials=conn.credentials_encrypted,
                        external_app_id=app.external_app_id,
                    )
                    checked += 1

                    if result.status != "unknown" and result.status != app.status:
                        old_status = app.status
                        app.status = result.status
                        db.commit()
                        updated += 1
                        logger.info(
                            "Application %s status changed: %s -> %s",
                            app.id,
                            old_status,
                            result.status,
                        )
                except Exception:
                    logger.exception(
                        "Error checking status for application %s on %s",
                        app.id,
                        portal_name,
                    )

        logger.info("check_application_statuses complete: checked=%d updated=%d", checked, updated)
        return {"checked": checked, "updated": updated}
    finally:
        db.close()
