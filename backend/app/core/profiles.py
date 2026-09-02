from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.candidate import CandidateProfile
from app.models.user import User


async def get_or_create_candidate_profile(
    db: AsyncSession, user: User
) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user.id)
    )
    profile = result.scalar_one_or_none()
    if profile:
        return profile

    profile = CandidateProfile(
        user_id=user.id,
        full_name=user.email.split("@")[0],
    )
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile
