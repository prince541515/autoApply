from __future__ import annotations

from uuid import UUID

from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityEvent


def record_activity_sync(
    db: Session,
    *,
    user_id: UUID | str | None,
    candidate_id: UUID | str | None,
    event_type: str,
    metadata: dict | None = None,
) -> None:
    if not user_id:
        return
    db.add(
        ActivityEvent(
            user_id=user_id,
            candidate_id=candidate_id,
            event_type=event_type,
            extra=metadata,
        )
    )
    db.commit()


async def record_activity(
    db: AsyncSession,
    *,
    user_id: UUID | str | None,
    candidate_id: UUID | str | None,
    event_type: str,
    metadata: dict | None = None,
) -> None:
    if not user_id:
        return
    db.add(
        ActivityEvent(
            user_id=user_id,
            candidate_id=candidate_id,
            event_type=event_type,
            extra=metadata,
        )
    )
    await db.flush()
