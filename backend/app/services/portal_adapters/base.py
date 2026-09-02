from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any


@dataclass
class ApplyResult:
    """Standardized result from a job application attempt."""
    success: bool
    message: str = ""
    external_app_id: str | None = None
    screenshot_path: str | None = None
    method: str = "api"  # "api" or "browser"
    extra: dict[str, Any] = field(default_factory=dict)


@dataclass
class ScrapedJob:
    """Normalized job listing from any portal search."""
    external_id: str
    portal: str
    title: str
    company: str
    location: str | None = None
    description: str | None = None
    url: str = ""
    salary_min: int | None = None
    salary_max: int | None = None
    posted_at: str | None = None
    raw_data: dict[str, Any] = field(default_factory=dict)


class BasePortalAdapter(ABC):
    """Abstract interface that every job-portal adapter must implement."""

    portal_name: str

    MAX_APPLIES_PER_HOUR: int = 5
    MAX_APPLIES_PER_DAY: int = 25

    @abstractmethod
    async def authenticate(self, credentials: dict[str, Any]) -> bool:
        """Authenticate with the portal. Returns True on success."""
        ...

    @abstractmethod
    async def search_jobs(self, query: dict[str, Any]) -> list[ScrapedJob]:
        """Search for jobs matching *query*. Returns a list of ScrapedJob."""
        ...

    @abstractmethod
    async def apply_to_job(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Submit an application for *job* on behalf of *candidate*."""
        ...

    @abstractmethod
    async def check_application_status(self, application_id: str) -> str:
        """Return the current status string for a submitted application."""
        ...

    @abstractmethod
    async def test_connection(self, credentials: dict[str, Any]) -> bool:
        """Quick connectivity / credential-validity check."""
        ...
