"""Wellfound (AngelList) job portal adapter with API and browser fallback."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .base import ApplyResult, BasePortalAdapter, ScrapedJob
from .browser import BrowserAutomation

logger = logging.getLogger(__name__)

WELLFOUND_API_BASE = "https://wellfound.com"
WELLFOUND_GRAPHQL = f"{WELLFOUND_API_BASE}/graphql"


class WellfoundAdapter(BasePortalAdapter):
    portal_name = "wellfound"

    MAX_APPLIES_PER_HOUR = 4
    MAX_APPLIES_PER_DAY = 20

    def __init__(self) -> None:
        self._auth_token: str | None = None
        self._cookies: dict[str, str] = {}

    async def authenticate(self, credentials: dict[str, Any]) -> bool:
        token = credentials.get("access_token")
        if token:
            self._auth_token = token
            return True

        email = credentials.get("email", "")
        password = credentials.get("password", "")
        if not email or not password:
            return False

        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    f"{WELLFOUND_API_BASE}/api/v1/sessions",
                    json={"email": email, "password": password},
                )
                if response.status_code in (200, 201):
                    self._cookies = dict(response.cookies)
                    data = response.json()
                    self._auth_token = data.get("token", "")
                    return True
                return False
        except httpx.HTTPError as exc:
            logger.exception("Wellfound auth failed: %s", exc)
            return False

    async def search_jobs(self, query: dict[str, Any]) -> list[ScrapedJob]:
        """Search Wellfound for startup jobs via GraphQL.

        Expected *query* keys: keywords, location, role, remote,
        salary_min, company_size, limit.
        """
        keywords = query.get("keywords", "")
        location = query.get("location", "")
        role = query.get("role", "")
        remote = query.get("remote", False)
        salary_min = query.get("salary_min", 0)
        limit = query.get("limit", 25)

        graphql_query = """
        query SearchJobs($filters: JobSearchFilters!, $first: Int) {
            jobListings(filters: $filters, first: $first) {
                edges {
                    node {
                        id
                        title
                        slug
                        description
                        remote
                        primaryRoleTitle
                        compensation {
                            min
                            max
                            currency
                        }
                        startup {
                            name
                            slug
                            companyUrl
                        }
                        locations {
                            name
                        }
                        postedAt
                    }
                }
            }
        }
        """

        variables: dict[str, Any] = {
            "filters": {
                "query": keywords,
                "locationNames": [location] if location else [],
                "roleTypes": [role] if role else [],
                "remote": remote,
                "minimumSalary": salary_min,
            },
            "first": limit,
        }

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        jobs: list[ScrapedJob] = []

        try:
            async with httpx.AsyncClient(timeout=30, cookies=self._cookies) as client:
                response = await client.post(
                    WELLFOUND_GRAPHQL,
                    json={"query": graphql_query, "variables": variables},
                    headers=headers,
                )

                if response.status_code != 200:
                    logger.warning("Wellfound search returned %d: %s", response.status_code, response.text[:200])
                    return []

                data = response.json()
                edges = data.get("data", {}).get("jobListings", {}).get("edges", [])

                for edge in edges:
                    node = edge.get("node", {})
                    startup = node.get("startup", {})
                    compensation = node.get("compensation", {})
                    locations = node.get("locations", [])
                    location_str = locations[0].get("name", "") if locations else ("Remote" if node.get("remote") else "")

                    jobs.append(ScrapedJob(
                        external_id=str(node.get("id", "")),
                        portal="wellfound",
                        title=node.get("title", ""),
                        company=startup.get("name", ""),
                        location=location_str,
                        description=node.get("description", ""),
                        url=f"https://wellfound.com/jobs/{node.get('slug', '')}",
                        salary_min=compensation.get("min"),
                        salary_max=compensation.get("max"),
                        posted_at=node.get("postedAt"),
                        raw_data=node,
                    ))

        except httpx.HTTPError as exc:
            logger.exception("Wellfound search failed: %s", exc)

        if not jobs and query.get("allow_browser") and not getattr(self, "_browser_search_used", False):
            self._browser_search_used = True
            from .public_search import search_wellfound_browser

            jobs = await search_wellfound_browser(str(keywords), str(location or ""), int(limit))

        return jobs

    async def apply_to_job(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Apply to a Wellfound job — API first, then browser fallback.

        Wellfound applications typically include a cover letter.
        """
        job_id = job.get("external_id", "")

        try:
            result = await self._apply_via_api(job, candidate)
            if result.success:
                return result
            logger.info("API apply failed for Wellfound job %s, falling back to browser", job_id)
        except NotImplementedError:
            logger.info("API apply not implemented for Wellfound, using browser")
        except Exception as exc:
            logger.warning("API apply error for Wellfound job %s: %s", job_id, exc)

        return await self._apply_via_browser(job, candidate)

    async def _apply_via_api(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Attempt Wellfound apply via API / GraphQL mutation."""
        job_id = job.get("external_id", "")

        mutation = """
        mutation ApplyToJob($input: ApplyToJobInput!) {
            applyToJob(input: $input) {
                application { id status }
                errors
            }
        }
        """

        variables = {
            "input": {
                "jobListingId": job_id,
                "coverLetter": candidate.get("cover_letter", ""),
                "resumeUrl": candidate.get("resume_url", ""),
            },
        }

        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        try:
            async with httpx.AsyncClient(timeout=30, cookies=self._cookies) as client:
                response = await client.post(
                    WELLFOUND_GRAPHQL,
                    json={"query": mutation, "variables": variables},
                    headers=headers,
                )

                if response.status_code in (200, 201):
                    data = response.json()
                    apply_data = data.get("data", {}).get("applyToJob", {})
                    errors = apply_data.get("errors", [])

                    if not errors and apply_data.get("application"):
                        app_data = apply_data["application"]
                        return ApplyResult(
                            success=True,
                            message="Applied via Wellfound API",
                            external_app_id=app_data.get("id", job_id),
                            method="api",
                        )

                    return ApplyResult(
                        success=False,
                        message=f"Wellfound API errors: {errors}",
                        method="api",
                    )

                return ApplyResult(
                    success=False,
                    message=f"Wellfound API returned {response.status_code}",
                    method="api",
                )

        except httpx.HTTPError as exc:
            return ApplyResult(success=False, message=f"Wellfound API error: {exc}", method="api")

    async def _apply_via_browser(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Apply using Playwright browser automation."""
        credentials = job.get("_credentials", {})
        job_url = job.get("url", "")
        resume_path = candidate.get("resume_path")
        cover_letter = candidate.get("cover_letter", "")

        candidate_data = {
            "full_name": candidate.get("full_name", ""),
            "email": candidate.get("email", ""),
            "phone": candidate.get("phone", ""),
            "location": candidate.get("location", ""),
        }

        browser = BrowserAutomation(headless=True)
        result = await browser.apply_via_browser(
            portal="wellfound",
            job_url=job_url,
            credentials=credentials,
            candidate_data=candidate_data,
            resume_path=resume_path,
            cover_letter=cover_letter,
        )

        return ApplyResult(
            success=result["success"],
            message=result["message"],
            external_app_id=job.get("external_id"),
            screenshot_path=result.get("screenshot"),
            method="browser",
        )

    async def check_application_status(self, application_id: str) -> str:
        query = """
        query GetApplication($id: ID!) {
            application(id: $id) { status }
        }
        """
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        try:
            async with httpx.AsyncClient(timeout=15, cookies=self._cookies) as client:
                response = await client.post(
                    WELLFOUND_GRAPHQL,
                    json={"query": query, "variables": {"id": application_id}},
                    headers=headers,
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("data", {}).get("application", {}).get("status", "applied")
        except httpx.HTTPError as exc:
            logger.warning("Failed to check Wellfound application status: %s", exc)

        return "applied"

    async def test_connection(self, credentials: dict[str, Any]) -> bool:
        """Validate Wellfound credentials."""
        if credentials.get("access_token"):
            try:
                async with httpx.AsyncClient(timeout=10) as client:
                    response = await client.get(
                        f"{WELLFOUND_API_BASE}/api/v1/me",
                        headers={"Authorization": f"Bearer {credentials['access_token']}"},
                    )
                    return response.status_code == 200
            except httpx.HTTPError:
                return False
        return bool(credentials.get("email") and credentials.get("password"))
