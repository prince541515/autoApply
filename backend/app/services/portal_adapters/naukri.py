"""Naukri.com job portal adapter with API and browser fallback."""

from __future__ import annotations

import logging
from typing import Any

import httpx

from .base import ApplyResult, BasePortalAdapter, ScrapedJob
from .browser import BrowserAutomation

logger = logging.getLogger(__name__)

NAUKRI_API_BASE = "https://www.naukri.com"


class NaukriAdapter(BasePortalAdapter):
    portal_name = "naukri"

    MAX_APPLIES_PER_HOUR = 10
    MAX_APPLIES_PER_DAY = 50

    def __init__(self) -> None:
        self._auth_token: str | None = None
        self._cookies: dict[str, str] = {}
        self.last_message: str = ""

    async def authenticate(self, credentials: dict[str, Any]) -> bool:
        email = credentials.get("email", "")
        password = credentials.get("password", "")
        session_cookie = credentials.get("session_cookie")
        if session_cookie:
            self._cookies["nauk_at"] = session_cookie
            self.last_message = "Connection successful"
            return True
        if not email or not password:
            self.last_message = "Email and password are required"
            return False

        if await self._authenticate_via_api(email, password):
            self.last_message = "Connection successful"
            return True

        logger.info("Naukri API login unavailable, falling back to browser")
        browser = BrowserAutomation(headless=True)
        ok, message = await browser.test_login("naukri", email, password)
        self.last_message = message
        return ok

    async def _authenticate_via_api(self, email: str, password: str) -> bool:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "appid": "109",
            "systemid": "Naukri",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Origin": NAUKRI_API_BASE,
            "Referer": f"{NAUKRI_API_BASE}/nlogin/login",
        }
        try:
            async with httpx.AsyncClient(timeout=12.0, follow_redirects=True, headers=headers) as client:
                response = await client.post(
                    f"{NAUKRI_API_BASE}/central-login-services/v1/login",
                    json={"username": email, "password": password},
                )
                if response.status_code == 200:
                    self._auth_token = response.headers.get("authorization", "")
                    self._cookies = dict(response.cookies)
                    return True
                logger.warning("Naukri auth returned %d", response.status_code)
                return False
        except httpx.HTTPError as exc:
            logger.warning("Naukri API login failed: %s", exc)
            return False

    async def search_jobs(self, query: dict[str, Any]) -> list[ScrapedJob]:
        """Search Naukri for jobs.

        Expected *query* keys: keywords, location, experience, salary,
        job_type, sort_by, limit.
        """
        keywords = query.get("keywords", "")
        location = query.get("location", "")
        experience = query.get("experience", "")
        salary = query.get("salary", "")
        limit = query.get("limit", 25)
        sort_by = query.get("sort_by", "date")

        params: dict[str, Any] = {
            "noOfResults": limit,
            "urlType": "search_by_key_loc",
            "searchType": "adv",
            "keyword": keywords,
            "location": location,
            "sort": sort_by,
            "pageNo": 1,
        }
        if experience:
            params["experience"] = experience
        if salary:
            params["salary"] = salary

        headers: dict[str, str] = {
            "appid": "109",
            "systemid": "Naukri",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/125.0.0.0 Safari/537.36"
            ),
            "Referer": "https://www.naukri.com/",
        }
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        jobs: list[ScrapedJob] = []

        try:
            async with httpx.AsyncClient(timeout=30, cookies=self._cookies) as client:
                response = await client.get(
                    f"{NAUKRI_API_BASE}/jobapi/v3/search",
                    params=params,
                    headers=headers,
                )

                if response.status_code == 200:
                    data = response.json()
                    job_details = data.get("jobDetails", [])

                    for item in job_details:
                        salary_str = item.get("placeholders", [{}])[2].get("label", "") if len(item.get("placeholders", [])) > 2 else ""
                        sal_min, sal_max = self._parse_salary(salary_str)

                        jobs.append(ScrapedJob(
                            external_id=str(item.get("jobId", "")),
                            portal="naukri",
                            title=item.get("title", ""),
                            company=item.get("companyName", ""),
                            location=item.get("placeholders", [{}])[1].get("label", "") if len(item.get("placeholders", [])) > 1 else "",
                            description=item.get("jobDescription", ""),
                            url=f"https://www.naukri.com{item.get('jdURL', '')}",
                            salary_min=sal_min,
                            salary_max=sal_max,
                            posted_at=item.get("footerPlaceholderLabel"),
                            raw_data=item,
                        ))
                else:
                    logger.warning("Naukri search returned %d: %s", response.status_code, response.text[:200])

        except httpx.HTTPError as exc:
            logger.exception("Naukri search failed: %s", exc)

        if not jobs:
            from .public_search import search_naukri_browser, search_naukri_public

            jobs = await search_naukri_public(str(keywords), str(location or ""), int(limit))
            if not jobs and query.get("allow_browser") and not getattr(self, "_browser_search_used", False):
                self._browser_search_used = True
                jobs = await search_naukri_browser(str(keywords), str(location or ""), int(limit))

        return jobs

    @staticmethod
    def _parse_salary(salary_str: str) -> tuple[int | None, int | None]:
        """Parse a salary string like '10-15 Lacs' into (min, max) integers."""
        import re
        match = re.search(r"(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(?:Lacs|LPA)", salary_str, re.IGNORECASE)
        if match:
            return int(float(match.group(1)) * 100000), int(float(match.group(2)) * 100000)
        return None, None

    async def apply_to_job(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Apply to a Naukri job — API with resume upload, then browser fallback."""
        job_id = job.get("external_id", "")

        try:
            result = await self._apply_via_api(job, candidate)
            if result.success:
                return result
            logger.info("API apply failed for Naukri job %s, falling back to browser", job_id)
        except NotImplementedError:
            logger.info("API apply not implemented for Naukri, using browser")
        except Exception as exc:
            logger.warning("API apply error for Naukri job %s: %s", job_id, exc)

        return await self._apply_via_browser(job, candidate)

    async def _apply_via_api(
        self, job: dict[str, Any], candidate: dict[str, Any]
    ) -> ApplyResult:
        """Attempt Naukri quick-apply via API."""
        job_id = job.get("external_id", "")

        headers: dict[str, str] = {
            "appid": "109",
            "systemid": "Naukri",
            "Content-Type": "application/json",
        }
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        payload = {
            "jobId": job_id,
            "resumeId": candidate.get("resume_id"),
            "coverletter": candidate.get("cover_letter", ""),
        }

        try:
            async with httpx.AsyncClient(timeout=30, cookies=self._cookies) as client:
                response = await client.post(
                    f"{NAUKRI_API_BASE}/jobapi/v1/apply",
                    json=payload,
                    headers=headers,
                )

                if response.status_code in (200, 201):
                    return ApplyResult(
                        success=True,
                        message="Applied via Naukri API",
                        external_app_id=job_id,
                        method="api",
                    )

                return ApplyResult(
                    success=False,
                    message=f"Naukri API returned {response.status_code}: {response.text[:200]}",
                    method="api",
                )

        except httpx.HTTPError as exc:
            return ApplyResult(success=False, message=f"Naukri API error: {exc}", method="api")

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
            portal="naukri",
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
        headers: dict[str, str] = {"appid": "109", "systemid": "Naukri"}
        if self._auth_token:
            headers["Authorization"] = f"Bearer {self._auth_token}"

        try:
            async with httpx.AsyncClient(timeout=15, cookies=self._cookies) as client:
                response = await client.get(
                    f"{NAUKRI_API_BASE}/jobapi/v1/applications/{application_id}",
                    headers=headers,
                )
                if response.status_code == 200:
                    data = response.json()
                    return data.get("status", "applied")
        except httpx.HTTPError as exc:
            logger.warning("Failed to check Naukri application status: %s", exc)

        return "applied"

    async def test_connection(self, credentials: dict[str, Any]) -> bool:
        """Test Naukri credentials via API, then browser login if needed."""
        return await self.authenticate(credentials)
