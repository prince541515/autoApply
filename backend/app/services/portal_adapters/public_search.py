"""Unauthenticated public search fallbacks when official portal APIs fail."""

from __future__ import annotations

import logging
import re
import xml.etree.ElementTree as ET
from typing import Any
from urllib.parse import quote_plus

import httpx

from .base import ScrapedJob

logger = logging.getLogger(__name__)

BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/125.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


def _clean(text: str | None) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", text).strip()


async def search_linkedin_guest(
    keywords: str,
    location: str = "",
    limit: int = 15,
    within_hours: int | None = None,
    experience_level: str | None = None,
) -> list[ScrapedJob]:
    seconds = (within_hours or 168) * 3600
    params = {
        "keywords": keywords,
        "start": 0,
        "f_TPR": f"r{seconds}",
    }
    if location:
        params["location"] = location
    if experience_level:
        params["f_E"] = experience_level

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=BROWSER_HEADERS) as client:
            response = await client.get(
                "https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search",
                params=params,
            )
            if response.status_code != 200:
                logger.warning("LinkedIn guest search returned %d", response.status_code)
                return []
            html = response.text
    except httpx.HTTPError as exc:
        logger.warning("LinkedIn guest search failed: %s", exc)
        return []

    jobs: list[ScrapedJob] = []
    cards = re.split(r'<div[^>]*class="[^"]*base-card', html)
    for card in cards[1:]:
        urn = re.search(r"urn:li:jobPosting:(\d+)", card)
        title = re.search(r'base-search-card__title[^>]*>(.*?)</', card, re.DOTALL)
        company = re.search(r'base-search-card__subtitle[^>]*>(.*?)</', card, re.DOTALL)
        loc = re.search(r'job-search-card__location[^>]*>(.*?)</', card, re.DOTALL)
        href = re.search(r'href="(https://www\.linkedin\.com/jobs/view/[^"]+)"', card)
        if not urn or not title:
            continue
        job_id = urn.group(1)
        title_text = _clean(re.sub(r"<[^>]+>", "", title.group(1)))
        company_text = _clean(re.sub(r"<[^>]+>", "", company.group(1))) if company else "Unknown"
        loc_text = _clean(re.sub(r"<[^>]+>", "", loc.group(1))) if loc else location or None
        url = href.group(1).split("?")[0] if href else f"https://www.linkedin.com/jobs/view/{job_id}"
        posted = re.search(r'datetime="(\d{4}-\d{2}-\d{2})"', card)
        jobs.append(
            ScrapedJob(
                external_id=job_id,
                portal="linkedin",
                title=title_text,
                company=company_text,
                location=loc_text,
                description=None,
                url=url,
                posted_at=posted.group(1) if posted else None,
            )
        )
        if len(jobs) >= limit:
            break
    return jobs


def _hours_to_days(within_hours: int | None) -> int | None:
    if not within_hours:
        return None
    return max(1, -(-within_hours // 24))


async def search_indeed_rss(
    keywords: str,
    location: str = "",
    limit: int = 15,
    within_hours: int | None = None,
) -> list[ScrapedJob]:
    loc = (location or "").lower()
    host = "in.indeed.com" if any(token in loc for token in ("india", "bangalore", "bengaluru", "hyderabad", "mumbai", "delhi", "pune", "chennai")) else "www.indeed.com"
    url = f"https://{host}/rss?q={quote_plus(keywords)}"
    if location:
        url += f"&l={quote_plus(location)}"
    days = _hours_to_days(within_hours)
    if days:
        url += f"&fromage={days}"

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=BROWSER_HEADERS) as client:
            response = await client.get(url)
            if response.status_code != 200:
                logger.warning("Indeed RSS returned %d", response.status_code)
                return []
            xml_text = response.text
    except httpx.HTTPError as exc:
        logger.warning("Indeed RSS failed: %s", exc)
        return []

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        logger.warning("Indeed RSS was not valid XML")
        return []

    jobs: list[ScrapedJob] = []
    for item in root.findall(".//item"):
        title_el = item.find("title")
        link_el = item.find("link")
        guid_el = item.find("guid")
        desc_el = item.find("description")
        title_text = _clean(title_el.text if title_el is not None else "")
        if " - " in title_text:
            job_title, company = title_text.rsplit(" - ", 1)
        else:
            job_title, company = title_text, "Unknown"
        link = (link_el.text or "").strip() if link_el is not None else ""
        guid = (guid_el.text or "").strip() if guid_el is not None else link
        jk = re.search(r"[?&]jk=([a-z0-9]+)", link or guid, re.IGNORECASE)
        external_id = jk.group(1) if jk else guid or link
        if not job_title or not external_id:
            continue
        jobs.append(
            ScrapedJob(
                external_id=external_id,
                portal="indeed",
                title=job_title,
                company=company,
                location=location or None,
                description=_clean(re.sub(r"<[^>]+>", " ", desc_el.text or "")) if desc_el is not None else None,
                url=link or f"https://{host}/viewjob?jk={external_id}",
            )
        )
        if len(jobs) >= limit:
            break
    return jobs


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


async def _launch_stealth_page(playwright):
    browser = await playwright.chromium.launch(
        headless=True,
        args=["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    )
    page = await browser.new_page(extra_http_headers=BROWSER_HEADERS)
    await page.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    )
    return browser, page


async def search_indeed_browser(
    keywords: str,
    location: str = "",
    limit: int = 15,
    within_hours: int | None = None,
) -> list[ScrapedJob]:
    """Load Indeed's public search page in a browser and parse the job cards."""
    loc = (location or "").lower()
    host = (
        "in.indeed.com"
        if any(t in loc for t in ("india", "karnataka", "maharashtra", "telangana", "tamil", "delhi", "bangalore", "bengaluru", "hyderabad", "mumbai", "pune", "chennai"))
        else "www.indeed.com"
    )
    url = f"https://{host}/jobs?q={quote_plus(keywords)}"
    if location:
        url += f"&l={quote_plus(location)}"
    days = _hours_to_days(within_hours)
    if days:
        url += f"&fromage={days}"

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return []

    jobs: list[ScrapedJob] = []
    try:
        async with async_playwright() as playwright:
            browser, page = await _launch_stealth_page(playwright)
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_timeout(3500)
                cards = await page.query_selector_all(".job_seen_beacon, [data-testid='slider_item']")
                seen_jks: set[str] = set()
                for card in cards[: limit * 3]:
                    link = await card.query_selector("a[data-jk], h2 a")
                    if not link:
                        continue
                    jk = await link.get_attribute("data-jk")
                    href = await link.get_attribute("href") or ""
                    if not jk:
                        match = re.search(r"jk=([a-z0-9]+)", href, re.IGNORECASE)
                        jk = match.group(1) if match else None
                    if jk in seen_jks:
                        continue
                    if jk:
                        seen_jks.add(jk)
                    title = _clean(await link.inner_text())
                    company_el = await card.query_selector("[data-testid='company-name']")
                    loc_el = await card.query_selector("[data-testid='text-location']")
                    if not jk or not title:
                        continue
                    jobs.append(
                        ScrapedJob(
                            external_id=jk,
                            portal="indeed",
                            title=title,
                            company=_clean(await company_el.inner_text()) if company_el else "Unknown",
                            location=_clean(await loc_el.inner_text()) if loc_el else location or None,
                            url=f"https://{host}/viewjob?jk={jk}",
                        )
                    )
                    if len(jobs) >= limit:
                        break
            finally:
                await browser.close()
    except Exception:
        logger.exception("Indeed browser scrape failed")
    return jobs


async def search_wellfound_browser(
    keywords: str, location: str = "", limit: int = 15
) -> list[ScrapedJob]:
    """Load Wellfound's public role page in a browser and parse job links."""
    role_slug = _slug(keywords)
    if not role_slug:
        return []
    loc_slug = _slug(location.split(",")[0]) if location else ""
    url = (
        f"https://wellfound.com/role/l/{role_slug}/{loc_slug}"
        if loc_slug
        else f"https://wellfound.com/role/{role_slug}"
    )

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return []

    jobs: list[ScrapedJob] = []
    try:
        async with async_playwright() as playwright:
            browser, page = await _launch_stealth_page(playwright)
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=25000)
                await page.wait_for_timeout(4000)
                links = await page.query_selector_all("a[href*='/jobs/']")
                seen: set[str] = set()
                for link in links:
                    href = await link.get_attribute("href") or ""
                    match = re.search(r"/jobs/(\d+)-([a-z0-9-]+)", href)
                    if not match or match.group(1) in seen:
                        continue
                    title = _clean(await link.inner_text())
                    if not title or len(title) < 3:
                        continue
                    seen.add(match.group(1))
                    company = "Unknown"
                    try:
                        container = await link.evaluate_handle(
                            "el => el.closest('[data-test], .styles_component__uTjje') || el.parentElement"
                        )
                        el = container.as_element()
                        if el:
                            name_el = await el.query_selector("h2, .relative a[href^='/company/']")
                            if name_el:
                                company = _clean(await name_el.inner_text()) or "Unknown"
                    except Exception:
                        pass
                    jobs.append(
                        ScrapedJob(
                            external_id=match.group(1),
                            portal="wellfound",
                            title=title,
                            company=company,
                            location=location or None,
                            url=f"https://wellfound.com{href.split('?')[0]}",
                        )
                    )
                    if len(jobs) >= limit:
                        break
            finally:
                await browser.close()
    except Exception:
        logger.exception("Wellfound browser scrape failed")
    return jobs


async def search_naukri_browser(
    keywords: str, location: str = "", limit: int = 15
) -> list[ScrapedJob]:
    """Load Naukri's public search page and capture the jobapi JSON it fetches."""
    loc_slug = _slug(location) if location else ""
    key_slug = _slug(keywords) or "jobs"
    page_url = (
        f"https://www.naukri.com/{key_slug}-jobs-in-{loc_slug}"
        if loc_slug
        else f"https://www.naukri.com/{key_slug}-jobs"
    )
    captured: dict[str, Any] = {}

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        logger.warning("Playwright is not installed; cannot scrape Naukri in-browser")
        return []

    try:
        async with async_playwright() as playwright:
            browser, page = await _launch_stealth_page(playwright)

            async def _on_response(response) -> None:
                if "/jobapi/v3/search" in response.url and response.status == 200:
                    try:
                        captured["data"] = await response.json()
                    except Exception:
                        return

            page.on("response", _on_response)
            await page.goto(page_url, wait_until="domcontentloaded", timeout=25000)
            for _ in range(4):
                await page.wait_for_timeout(2000)
                if "data" in captured:
                    break
            if "data" not in captured:
                try:
                    await page.wait_for_selector(
                        "article.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple",
                        timeout=6000,
                    )
                except Exception:
                    pass
                cards = await page.query_selector_all("article.jobTuple, .srp-jobtuple-wrapper, .cust-job-tuple")
                jobs: list[ScrapedJob] = []
                for card in cards[:limit]:
                    title_el = await card.query_selector("a.title, .title")
                    company_el = await card.query_selector("a.comp-name, .comp-name")
                    loc_el = await card.query_selector(".locWdth, .loc")
                    href = await title_el.get_attribute("href") if title_el else None
                    title_text = _clean(await title_el.inner_text()) if title_el else ""
                    if not title_text:
                        continue
                    job_id = ""
                    if href:
                        match = re.search(r"-(\d+)\??", href)
                        job_id = match.group(1) if match else href
                    jobs.append(
                        ScrapedJob(
                            external_id=job_id or title_text,
                            portal="naukri",
                            title=title_text,
                            company=_clean(await company_el.inner_text()) if company_el else "Unknown",
                            location=_clean(await loc_el.inner_text()) if loc_el else location or None,
                            url=href or page_url,
                        )
                    )
                await browser.close()
                return jobs
            await browser.close()
    except Exception:
        logger.exception("Naukri browser scrape failed")
        return []

    data = captured.get("data") or {}
    jobs = []
    for item in data.get("jobDetails", [])[:limit]:
        placeholders = item.get("placeholders") or []
        loc_label = placeholders[1].get("label", "") if len(placeholders) > 1 else ""
        jobs.append(
            ScrapedJob(
                external_id=str(item.get("jobId", "")),
                portal="naukri",
                title=item.get("title", ""),
                company=item.get("companyName") or "Unknown",
                location=loc_label or location or None,
                description=item.get("jobDescription", ""),
                url=f"https://www.naukri.com{item.get('jdURL', '')}",
                posted_at=item.get("footerPlaceholderLabel"),
                raw_data=item,
            )
        )
    return jobs


async def search_naukri_public(
    keywords: str, location: str = "", limit: int = 15
) -> list[ScrapedJob]:
    headers = {
        **BROWSER_HEADERS,
        "Accept": "application/json",
        "appid": "109",
        "systemid": "naukri",
        "Referer": "https://www.naukri.com/",
    }
    params: dict[str, Any] = {
        "noOfResults": limit,
        "urlType": "search_by_key_loc" if location else "search_by_keyword",
        "searchType": "adv",
        "keyword": keywords,
        "pageNo": 1,
        "sort": "date",
    }
    if location:
        params["location"] = location

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True, headers=headers) as client:
            response = await client.get("https://www.naukri.com/jobapi/v3/search", params=params)
            if response.status_code != 200:
                logger.warning("Naukri public search returned %d", response.status_code)
                return []
            data = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Naukri public search failed: %s", exc)
        return []

    jobs: list[ScrapedJob] = []
    for item in data.get("jobDetails", []):
        placeholders = item.get("placeholders") or []
        loc_label = placeholders[1].get("label", "") if len(placeholders) > 1 else ""
        jobs.append(
            ScrapedJob(
                external_id=str(item.get("jobId", "")),
                portal="naukri",
                title=item.get("title", ""),
                company=item.get("companyName") or "Unknown",
                location=loc_label or location or None,
                description=item.get("jobDescription", ""),
                url=f"https://www.naukri.com{item.get('jdURL', '')}",
                posted_at=item.get("footerPlaceholderLabel"),
                raw_data=item,
            )
        )
        if len(jobs) >= limit:
            break
    return jobs
