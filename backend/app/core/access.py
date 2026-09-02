from uuid import UUID

from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.models.application import Application
from app.models.candidate import CandidateProfile


def auto_apply_effective(profile: CandidateProfile) -> bool:
    return bool(profile.auto_apply_allowed and profile.auto_apply_enabled)


async def pause_queued_applications(db: AsyncSession, candidate_id: UUID) -> None:
    await db.execute(
        update(Application)
        .where(
            Application.candidate_id == candidate_id,
            Application.status == "queued",
        )
        .values(status="paused")
        .execution_options(synchronize_session=False)
    )


async def disable_auto_apply_runtime(db: AsyncSession, profile: CandidateProfile) -> None:
    profile.auto_apply_enabled = False
    await pause_queued_applications(db, profile.id)


def pause_queued_applications_sync(db: Session, candidate_id: UUID) -> None:
    db.execute(
        update(Application)
        .where(
            Application.candidate_id == candidate_id,
            Application.status == "queued",
        )
        .values(status="paused")
        .execution_options(synchronize_session=False)
    )
    db.commit()
