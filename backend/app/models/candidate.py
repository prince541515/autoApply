import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text, func, text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CandidateProfile(Base):
    __tablename__ = "candidate_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    full_name: Mapped[str] = mapped_column(String(256), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    location: Mapped[str | None] = mapped_column(String(256), nullable=True)
    skills: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    experience: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    education: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    resume_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    auto_apply_enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    auto_apply_allowed: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    beat_scrape_interval_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    last_beat_scrape_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    daily_scrape_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    scrape_quota_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    scrape_quota_used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="candidate_profile")
    portal_connections: Mapped[list["PortalConnection"]] = relationship(
        "PortalConnection", back_populates="candidate", cascade="all, delete-orphan"
    )
    preferences: Mapped[list["JobPreference"]] = relationship(
        "JobPreference", back_populates="candidate", cascade="all, delete-orphan"
    )
    applications: Mapped[list["Application"]] = relationship(
        "Application", back_populates="candidate", cascade="all, delete-orphan"
    )
