"""LinkedIn job portal adapter with API and browser fallback."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .base import ApplyResult, BasePortalAdapter, ScrapedJob
from .browser import BrowserAutomation

logger = logging.getLogger(__name__)

LINKEDIN_API_BASE = "https://api.linkedin.com/v2"


class LinkedInAdapter(BasePortalAdapter):
    portal_name = "linkedin"

    MAX_APPLIES_PER_HOUR = 5
    MAX_APPLIES_PER_DAY = 25

    def __init__(self) -> None:
        self._session_token: str | None = None

    async def authenticate(self, credentials: dict[str, Any]) -> bool:
        self._session_token = credentials.get("session_cookie") or credentials.get("access_token")
        if not self._session_token:
            logger.warning("No LinkedIn session token or access_token provided")
            return False
        return True

    async def search_jobs(self, query: dict[str, Any]) -> list[ScrapedJob]:
        """Search LinkedIn for jobs matching the query.

        Expected *query* keys: keywords, location, date_posted, job_type,
        experience_level, remote, limit.
        """
        keywords = query.get("keywords", "")
        location = query.get("location", "")
        date_posted = query.get("date_posted", "past-week")
        job_type = query.get("job_type", "F")
        experience = query.get("experience_level", "")
        limit = query.get("limit", 25)
        within_hours = query.get("posted_within_hours")

        time_filter_map = {
            "past-24h": "r86400",
            "past-week": "r604800",
            "past-month": "r2592000",
        }
        time_filter = (
            f"r{int(within_hours) * 3600}"
            if within_hours
            else time_filter_map.get(date_posted, "r604800")
        )

        params: dict[str, Any] = {
            "keywords": keywords,
            "location": location,
            "f_TPR": time_filter,
            "f_JT": job_type,
            "count": limit,
        }
        if experience:
            params["f_E"] = experience

        jobs: list[ScrapedJob] = []

        if self._session_token:
            try:
                async with httpx.AsyncClient(timeout=30) as client:
                    response = await client.get(
                        f"{LINKEDIN_API_BASE}/jobSearch",
                        params=params,
                        headers={"Authorization": f"Bearer {self._session_token}"},
                    )
                if response.status_code == 200:
                    data = response.json()
                    for item in data.get("elements", []):
                        jobs.append(ScrapedJob(
                            external_id=str(item.get("id", "")),
                            portal="linkedin",
                            title=item.get("title", ""),
                            company=item.get("companyName", ""),
                            location=item.get("formattedLocation", ""),
                            description=item.get("description", {}).get("text", ""),
                            url=f"https://www.linkedin.com/jobs/view/{item.get('id', '')}",
                            salary_min=item.get("salaryInsights", {}).get("min"),
                            salary_max=item.get("salaryInsights", {}).get("max"),
                            posted_at=item.get("listedAt"),
                            raw_data=item,
                        ))
                else:
                    logger.warning("LinkedIn search returned %d: %s", response.status_code, response.text[:200])
            except httpx.HTTPError as exc:
                logger.exception("LinkedIn search request failed: %s", exc)

        if not jobs:
            from .public_search import search_linkedin_guest

            jobs = await search_linkedin_guest(
                str(keywords),
                str(location or ""),
                int(limit),
                within_hours=int(within_hours) if within_hours else None,
                experience_level=str(experience) if experience else None,
            )

        return jobs

    async def apply_to_job(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Apply to a LinkedIn job — API first, then browser fallback."""
        job_id = job.get("external_id", "")
        job_url = job.get("url", f"https://www.linkedin.com/jobs/view/{job_id}")

        try:
            result = await self._apply_via_api(job, candidate)
            if result.success:
                return result
            logger.info("API apply failed for LinkedIn job %s, falling back to browser", job_id)
        except NotImplementedError:
            logger.info("API apply not implemented for LinkedIn, using browser")
        except Exception as exc:
            logger.warning("API apply error for LinkedIn job %s: %s", job_id, exc)

        return await self._apply_via_browser(job, candidate)

    async def _apply_via_api(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Attempt LinkedIn Easy Apply via API."""
        job_id = job.get("external_id", "")
        headers = {"Authorization": f"Bearer {self._session_token}"}

        payload = {
            "jobId": job_id,
            "applicationData": {
                "resumeUrl": candidate.get("resume_url", ""),
                "phoneNumber": candidate.get("phone", ""),
                "email": candidate.get("email", ""),
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{LINKEDIN_API_BASE}/easyApply",
                    json=payload,
                    headers=headers,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    return ApplyResult(
                        success=True,
                        message="Applied via LinkedIn Easy Apply API",
                        external_app_id=data.get("applicationId", job_id),
                        method="api",
                    )

                return ApplyResult(
                    success=False,
                    message=f"LinkedIn API returned {response.status_code}: {response.text[:200]}",
                    method="api",
                )

        except httpx.HTTPError as exc:
            return ApplyResult(success=False, message=f"LinkedIn API error: {exc}", method="api")

    async def _apply_via_browser(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Apply using Playwright browser automation."""
        credentials = job.get("_credentials", {})
        job_url = job.get("url", "")
        resume_path = candidate.get("resume_path")

        candidate_data = {
            "full_name": candidate.get("full_name", ""),
            "email": candidate.get("email", ""),
            "phone": candidate.get("phone", ""),
            "location": candidate.get("location", ""),
        }

        browser = BrowserAutomation(headless=True)
        result = await browser.apply_via_browser(
            portal="linkedin",
            job_url=job_url,
            credentials=credentials,
            candidate_data=candidate_data,
            resume_path=resume_path,
        )

        return ApplyResult(
            success=result["success"],
            message=result["message"],
            external_app_id=job.get("external_id"),
            screenshot_path=result.get("screenshot"),
            method="browser",
        )

    async def check_application_status(self, application_id: str) -> str:
        headers = {"Authorization": f"Bearer {self._session_token}"}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(
                    f"{LINKEDIN_API_BASE}/applications/{application_id}",
                    headers=headers,
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("status", "applied")
        except httpx.HTTPError as exc:
            logger.warning("Failed to check LinkedIn status: %s", exc)

        return "applied"

    async def test_connection(self, credentials: dict[str, Any]) -> bool:
        """Validate credentials by making a lightweight authenticated request."""
        token = credentials.get("session_cookie") or credentials.get("access_token")
        if not token:
            return bool(credentials.get("email") and credentials.get("password"))

        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(
                    f"{LINKEDIN_API_BASE}/me",
                    headers={"Authorization": f"Bearer {token}"},
                )
                return response.status_code == 200
        except httpx.HTTPError:
            return False
