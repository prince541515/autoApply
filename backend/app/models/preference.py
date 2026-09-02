import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, func, text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class JobPreference(Base):
    __tablename__ = "job_preferences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    candidate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("candidate_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    roles: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    locations: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    min_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_salary: Mapped[int | None] = mapped_column(Integer, nullable=True)
    job_type: Mapped[str | None] = mapped_column(String(80), nullable=True)
    work_mode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    excluded_companies: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    required_skills: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    min_experience_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_experience_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    candidate: Mapped["CandidateProfile"] = relationship(
        "CandidateProfile", back_populates="preferences"
    )
