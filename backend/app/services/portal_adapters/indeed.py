"""Indeed job portal adapter with API and browser fallback."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .base import ApplyResult, BasePortalAdapter, ScrapedJob
from .browser import BrowserAutomation

logger = logging.getLogger(__name__)

INDEED_API_BASE = "https://apis.indeed.com"


class IndeedAdapter(BasePortalAdapter):
    portal_name = "indeed"

    MAX_APPLIES_PER_HOUR = 6
    MAX_APPLIES_PER_DAY = 30

    def __init__(self) -> None:
        self._auth_token: str | None = None
        self.last_message: str = ""

    async def authenticate(self, credentials: dict[str, Any]) -> bool:
        token = credentials.get("access_token") or credentials.get("api_key")
        if token:
            self._auth_token = token
            self.last_message = "Using Indeed API token"
            return True

        email = credentials.get("email")
        password = credentials.get("password")
        if email and password:
            self.last_message = (
                "Saved. Indeed has no public job-search API; listings come from Indeed’s website."
            )
            return True
        self.last_message = "Email and password are required"
        return False

    async def search_jobs(self, query: dict[str, Any]) -> list[ScrapedJob]:
        """Search Indeed for jobs.

        Expected *query* keys: keywords, location, job_type, radius,
        sort, date_posted, limit.
        """
        keywords = query.get("keywords", "")
        location = query.get("location", "")
        job_type = query.get("job_type", "fulltime")
        radius = query.get("radius", 25)
        sort = query.get("sort", "date")
        limit = query.get("limit", 25)
        within_hours = query.get("posted_within_hours")
        date_posted = (
            max(1, -(-int(within_hours) // 24)) if within_hours else query.get("date_posted", 7)
        )

        params: dict[str, Any] = {
            "q": keywords,
            "l": location,
            "jt": job_type,
            "radius": radius,
            "sort": sort,
            "fromage": date_posted,
            "limit": limit,
        }

        headers: dict[str, str] = {}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        max_exp = query.get("max_experience_years")
        if max_exp is not None and int(max_exp) <= 3:
            params["explvl"] = "entry_level"

        jobs: list[ScrapedJob] = []

        if self._auth_token:
            try:
                async with httpx.AsyncClient(timeout=8) as client:
                    response = await client.get(
                        f"{INDEED_API_BASE}/graphql",
                        params=params,
                        headers=headers,
                    )

                    if response.status_code == 200:
                        data = response.json()
                        results = data.get("results", [])

                        for item in results:
                            salary_info = item.get("salary", {})
                            jobs.append(ScrapedJob(
                                external_id=str(item.get("jobkey", "")),
                                portal="indeed",
                                title=item.get("jobtitle", ""),
                                company=item.get("company", ""),
                                location=item.get("formattedLocation", ""),
                                description=item.get("snippet", ""),
                                url=item.get("url", f"https://www.indeed.com/viewjob?jk={item.get('jobkey', '')}"),
                                salary_min=salary_info.get("min"),
                                salary_max=salary_info.get("max"),
                                posted_at=item.get("formattedRelativeTime"),
                                raw_data=item,
                            ))
                    else:
                        logger.warning("Indeed search returned %d: %s", response.status_code, response.text[:200])

            except httpx.HTTPError as exc:
                logger.warning("Indeed search failed: %s", exc)

        if not jobs:
            from .public_search import search_indeed_browser, search_indeed_rss

            hours = int(within_hours) if within_hours else None
            jobs = await search_indeed_rss(
                str(keywords), str(location or ""), int(limit), within_hours=hours
            )
            if not jobs and query.get("allow_browser") and not getattr(self, "_browser_search_used", False):
                self._browser_search_used = True
                jobs = await search_indeed_browser(
                    str(keywords), str(location or ""), int(limit), within_hours=hours
                )

        return jobs

    async def apply_to_job(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Apply via Indeed — API first (Easy Apply), then browser fallback."""
        job_id = job.get("external_id", "")

        try:
            result = await self._apply_via_api(job, candidate)
            if result.success:
                return result
            logger.info("API apply failed for Indeed job %s, falling back to browser", job_id)
        except NotImplementedError:
            logger.info("API apply not implemented for Indeed, using browser")
        except Exception as exc:
            logger.warning("API apply error for Indeed job %s: %s", job_id, exc)

        return await self._apply_via_browser(job, candidate)

    async def _apply_via_api(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Attempt Indeed Easy Apply via API."""
        job_id = job.get("external_id", "")
        headers: dict[str, str] = {}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        payload = {
            "jobKey": job_id,
            "resume": candidate.get("resume_url", ""),
            "applicant": {
                "fullName": candidate.get("full_name", ""),
                "email": candidate.get("email", ""),
                "phone": candidate.get("phone", ""),
            },
        }

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{INDEED_API_BASE}/v1/apply",
                    json=payload,
                    headers=headers,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    return ApplyResult(
                        success=True,
                        message="Applied via Indeed Easy Apply API",
                        external_app_id=data.get("applicationId", job_id),
                        method="api",
                    )

                return ApplyResult(
                    success=False,
                    message=f"Indeed API returned {response.status_code}: {response.text[:200]}",
                    method="api",
                )

        except httpx.HTTPError as exc:
            return ApplyResult(success=False, message=f"Indeed API error: {exc}", method="api")

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
            portal="indeed",
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
        headers: dict[str, str] = {}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        try:
            async with httpx.AsyncClient(timeout=15) as client:
                response = await client.get(
                    f"{INDEED_API_BASE}/v1/applications/{application_id}",
                    headers=headers,
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("status", "applied")
        except httpx.HTTPError as exc:
            logger.warning("Failed to check Indeed application status: %s", exc)

        return "applied"

    async def test_connection(self, credentials: dict[str, Any]) -> bool:
        """Store-and-go: Indeed does not expose a public search token API."""
        ok = await self.authenticate(credentials)
        return ok
