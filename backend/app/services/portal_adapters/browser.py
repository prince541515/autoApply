"""Playwright-based browser automation fallback for portal interactions.

Provides stealth-configured browser sessions with portal-specific selectors,
multi-step form filling, file uploads, and screenshot-based debugging.
"""

from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

SCREENSHOT_DIR = Path("uploads/screenshots")

USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0",
]

VIEWPORTS = [
    {"width": 1920, "height": 1080},
    {"width": 1366, "height": 768},
    {"width": 1536, "height": 864},
    {"width": 1440, "height": 900},
    {"width": 1280, "height": 800},
]

LOCALES = ["en-US", "en-GB", "en-IN", "en-AU"]

PORTAL_SELECTORS: dict[str, dict[str, Any]] = {
    "linkedin": {
        "login_url": "https://www.linkedin.com/login",
        "email_field": "#username",
        "password_field": "#password",
        "login_button": 'button[type="submit"]',
        "dashboard_indicator": ".feed-identity-module",
        "easy_apply_button": ".jobs-apply-button",
        "easy_apply_modal": ".jobs-easy-apply-modal",
        "next_button": 'button[aria-label="Continue to next step"]',
        "review_button": 'button[aria-label="Review your application"]',
        "submit_button": 'button[aria-label="Submit application"]',
        "done_button": 'button[aria-label="Dismiss"]',
        "resume_upload": 'input[type="file"]',
        "phone_field": 'input[name="phoneNumber"]',
        "confirmation_text": "Your application was sent",
    },
    "naukri": {
        "login_url": "https://www.naukri.com/nlogin/login",
        "email_field": [
            "#usernameField",
            'input[placeholder*="Email ID"]',
            'input[placeholder*="Username"]',
            'input[type="text"]',
        ],
        "password_field": ["#passwordField", 'input[type="password"]'],
        "password_toggle": [
            "text=Use Password to Login",
            "text=Login with Password",
            "text=Use Password",
            "#loginWithPassword",
            "a:has-text('Password')",
        ],
        "login_button": [
            "#loginButton",
            "button.loginButton",
            'button:has-text("Login")',
            'button[type="submit"]',
        ],
        "login_error": [
            ".erLbl",
            ".error-label",
            "#usernameField_err",
            "#passwordField_err",
            "text=Invalid details",
            "text=incorrect",
        ],
        "dashboard_indicator": [
            ".nI-gNb-drawer",
            ".nI-gNb-menuBtn",
            ".nI-gNb-bar",
            "a[href*='mnjuser']",
            ".nI-gNb-icon-img",
        ],
        "apply_button": ".apply-button, #apply-button, button.chatbot_applyBtn",
        "resume_upload": 'input[type="file"]',
        "submit_button": 'button[type="submit"]',
        "confirmation_text": "applied successfully",
    },
    "indeed": {
        "login_url": "https://secure.indeed.com/auth",
        "email_field": "#ifl-InputFormField-3",
        "password_field": "#ifl-InputFormField-7",
        "login_button": "#auth-submit-button",
        "dashboard_indicator": ".gnav-LoggedInAccountLink",
        "apply_button": "#indeedApplyButton, .indeed-apply-button",
        "resume_upload": 'input[type="file"]',
        "continue_button": ".ia-continueButton",
        "submit_button": ".ia-continueButton",
        "confirmation_text": "Your application has been submitted",
    },
    "wellfound": {
        "login_url": "https://wellfound.com/login",
        "email_field": 'input[name="email"]',
        "password_field": 'input[name="password"]',
        "login_button": 'button[type="submit"]',
        "dashboard_indicator": ".styles_component__nMcge",
        "apply_button": 'button:has-text("Apply"), a:has-text("Apply Now")',
        "resume_upload": 'input[type="file"]',
        "cover_letter_field": 'textarea[name="coverLetter"], textarea[placeholder*="cover letter"]',
        "submit_button": 'button[type="submit"]',
        "confirmation_text": "Application submitted",
    },
}

COMMON_FORM_SELECTORS = {
    "name": [
        'input[name="name"]', 'input[name="fullName"]', 'input[name="full_name"]',
        'input[id*="name" i]', 'input[placeholder*="name" i]',
    ],
    "first_name": [
        'input[name="firstName"]', 'input[name="first_name"]',
        'input[id*="first" i]', 'input[placeholder*="first name" i]',
    ],
    "last_name": [
        'input[name="lastName"]', 'input[name="last_name"]',
        'input[id*="last" i]', 'input[placeholder*="last name" i]',
    ],
    "email": [
        'input[name="email"]', 'input[type="email"]',
        'input[id*="email" i]', 'input[placeholder*="email" i]',
    ],
    "phone": [
        'input[name="phone"]', 'input[type="tel"]', 'input[name="phoneNumber"]',
        'input[id*="phone" i]', 'input[placeholder*="phone" i]',
    ],
    "location": [
        'input[name="location"]', 'input[name="city"]',
        'input[id*="location" i]', 'input[placeholder*="location" i]',
    ],
    "cover_letter": [
        'textarea[name="coverLetter"]', 'textarea[name="cover_letter"]',
        'textarea[id*="cover" i]', 'textarea[placeholder*="cover letter" i]',
    ],
    "resume": [
        'input[type="file"][name*="resume" i]',
        'input[type="file"][name*="cv" i]',
        'input[type="file"][accept*="pdf" i]',
        'input[type="file"]',
    ],
}


class BrowserAutomation:
    """Generic Playwright helper that works across any job portal."""

    def __init__(self, headless: bool = True) -> None:
        self.headless = headless
        self._playwright: Any = None
        self._browser: Any = None
        self._context: Any = None
        self._page: Any = None

    async def launch_browser(self) -> None:
        """Launch a Chromium instance with stealth settings."""
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error(
                "playwright is not installed – run "
                "`pip install playwright && playwright install chromium`"
            )
            raise

        self._playwright = await async_playwright().start()

        user_agent = random.choice(USER_AGENTS)
        viewport = random.choice(VIEWPORTS)
        locale = random.choice(LOCALES)

        self._browser = await self._playwright.chromium.launch(
            headless=self.headless,
            args=[
                "--disable-blink-features=AutomationControlled",
                "--disable-dev-shm-usage",
                "--no-sandbox",
            ],
        )
        self._context = await self._browser.new_context(
            viewport=viewport,
            user_agent=user_agent,
            locale=locale,
            timezone_id="Asia/Kolkata",
            permissions=["geolocation"],
            geolocation={"latitude": 15.8497, "longitude": 74.4977},
            color_scheme="light",
        )

        await self._context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
            Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
            Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
        """)

        self._page = await self._context.new_page()
        self._page.set_default_timeout(30000)

    @staticmethod
    def _as_list(value: Any) -> list[str]:
        if value is None:
            return []
        if isinstance(value, (list, tuple)):
            return [str(item) for item in value]
        return [str(value)]

    async def _fill_first_visible(self, selectors: Any, value: str) -> bool:
        for selector in self._as_list(selectors):
            try:
                element = self._page.locator(selector).first
                if await element.is_visible(timeout=4000):
                    await element.fill(value)
                    return True
            except Exception:
                continue
        return False

    async def _click_first_visible(self, selectors: Any, timeout: int = 3000) -> bool:
        for selector in self._as_list(selectors):
            try:
                element = self._page.locator(selector).first
                if await element.is_visible(timeout=timeout):
                    await element.click()
                    return True
            except Exception:
                continue
        return False

    async def _first_visible_text(self, selectors: Any) -> str | None:
        for selector in self._as_list(selectors):
            try:
                element = self._page.locator(selector).first
                if await element.is_visible(timeout=1500):
                    text = (await element.inner_text()).strip()
                    if text:
                        return text
            except Exception:
                continue
        return None

    async def _apply_session_cookies(self, portal: str, credentials: dict[str, str]) -> bool:
        if not self._context:
            return False
        token = credentials.get("session_cookie") or credentials.get("li_at")
        if not token:
            return False
        cookie_name = {
            "linkedin": "li_at",
            "naukri": "nauk_at",
            "indeed": "CTK",
            "wellfound": "_angellist_session",
        }.get(portal)
        domain = {
            "linkedin": ".linkedin.com",
            "naukri": ".naukri.com",
            "indeed": ".indeed.com",
            "wellfound": ".wellfound.com",
        }.get(portal)
        if not cookie_name or not domain:
            return False
        await self._context.add_cookies(
            [
                {
                    "name": cookie_name,
                    "value": token,
                    "domain": domain,
                    "path": "/",
                    "httpOnly": True,
                    "secure": True,
                }
            ]
        )
        return True

    async def login_to_portal(
        self, portal: str, email: str, password: str
    ) -> bool:
        """Log in to a job portal using stored credentials."""
        ok, _message = await self.login_to_portal_detailed(portal, email, password)
        return ok

    async def login_to_portal_detailed(
        self, portal: str, email: str, password: str
    ) -> tuple[bool, str]:
        """Log in and return (success, human-readable reason)."""
        if not self._page:
            await self.launch_browser()

        selectors = PORTAL_SELECTORS.get(portal)
        if not selectors:
            logger.error("No selectors defined for portal: %s", portal)
            return False, f"No login flow configured for {portal}"

        try:
            await self._page.goto(selectors["login_url"], wait_until="domcontentloaded")
            await self._page.wait_for_timeout(random.randint(800, 1600))

            if not await self._fill_first_visible(selectors["email_field"], email):
                await self.take_screenshot(f"login_no_email_{portal}")
                return False, f"Could not find the {portal} email field"

            await self._page.wait_for_timeout(random.randint(300, 700))

            if selectors.get("password_toggle"):
                password_visible = False
                for selector in self._as_list(selectors["password_field"]):
                    try:
                        if await self._page.locator(selector).first.is_visible(timeout=1500):
                            password_visible = True
                            break
                    except Exception:
                        continue
                if not password_visible:
                    await self._click_first_visible(selectors["password_toggle"], timeout=2000)
                    await self._page.wait_for_timeout(800)

            if not await self._fill_first_visible(selectors["password_field"], password):
                await self.take_screenshot(f"login_no_password_{portal}")
                return False, (
                    f"{portal} is asking for OTP instead of a password. "
                    "Open the site, switch to password login, then try again."
                )

            await self._page.wait_for_timeout(random.randint(300, 700))
            if not await self._click_first_visible(selectors["login_button"]):
                return False, f"Could not find the {portal} login button"

            await self._page.wait_for_load_state("domcontentloaded")
            await self._page.wait_for_timeout(2500)

            error_text = await self._first_visible_text(selectors.get("login_error"))
            if error_text:
                await self.take_screenshot(f"login_rejected_{portal}")
                return False, error_text

            page_text = ""
            try:
                page_text = (await self._page.inner_text("body")).lower()
            except Exception:
                pass
            if "otp" in page_text and "verify" in page_text:
                await self.take_screenshot(f"login_otp_{portal}")
                return False, (
                    f"{portal} sent an OTP. Automated login cannot complete 2FA."
                )

            dashboard_ok = False
            for selector in self._as_list(selectors.get("dashboard_indicator")):
                try:
                    await self._page.wait_for_selector(selector, timeout=8000)
                    dashboard_ok = True
                    break
                except Exception:
                    continue

            url = self._page.url.lower()
            left_login_page = "nlogin" not in url and "login" not in url.split("/")[-1]
            if dashboard_ok or left_login_page:
                logger.info("Successfully logged in to %s", portal)
                return True, "Connection successful"

            await self.take_screenshot(f"login_uncertain_{portal}")
            return False, f"Logged in to {portal} but the account page did not load"

        except Exception as exc:
            logger.exception("Login failed for portal %s", portal)
            await self.take_screenshot(f"login_failed_{portal}")
            return False, f"Could not reach {portal}: {exc}"

    async def test_login(self, portal: str, email: str, password: str) -> tuple[bool, str]:
        """Launch a browser, attempt login, then close the session."""
        try:
            await self.launch_browser()
            return await self.login_to_portal_detailed(portal, email, password)
        except Exception as exc:
            logger.exception("Browser test login failed for %s", portal)
            return False, f"Could not start a browser to verify {portal}: {exc}"
        finally:
            await self.close()

    async def navigate_to_job(self, url: str) -> None:
        """Navigate the browser to a job posting URL."""
        if not self._page:
            await self.launch_browser()

        try:
            await self._page.goto(url, wait_until="domcontentloaded", timeout=30000)
            await self._page.wait_for_load_state("networkidle")
            await self._page.wait_for_timeout(random.randint(1000, 2000))
        except Exception as exc:
            logger.exception("Failed to navigate to %s", url)
            await self.take_screenshot("navigate_failed")
            raise RuntimeError(f"Navigation to {url} failed: {exc}") from exc

    async def fill_application_form(
        self,
        candidate_data: dict[str, str],
        *,
        resume_path: str | None = None,
        cover_letter: str | None = None,
    ) -> None:
        """Detect and fill common application form fields from candidate data."""
        if not self._page:
            raise RuntimeError("Browser not launched – call launch_browser() first")

        field_mapping = {
            "name": candidate_data.get("full_name", ""),
            "first_name": candidate_data.get("first_name", ""),
            "last_name": candidate_data.get("last_name", ""),
            "email": candidate_data.get("email", ""),
            "phone": candidate_data.get("phone", ""),
            "location": candidate_data.get("location", ""),
        }

        for field_type, value in field_mapping.items():
            if not value:
                continue
            selectors = COMMON_FORM_SELECTORS.get(field_type, [])
            for selector in selectors:
                try:
                    element = self._page.locator(selector).first
                    if await element.is_visible(timeout=2000):
                        await element.clear()
                        await element.fill(value)
                        await self._page.wait_for_timeout(random.randint(200, 500))
                        logger.debug("Filled %s field with selector %s", field_type, selector)
                        break
                except Exception:
                    continue

        if cover_letter:
            for selector in COMMON_FORM_SELECTORS["cover_letter"]:
                try:
                    element = self._page.locator(selector).first
                    if await element.is_visible(timeout=2000):
                        await element.fill(cover_letter)
                        logger.debug("Filled cover letter field")
                        break
                except Exception:
                    continue

        if resume_path:
            await self._upload_resume(resume_path)

    async def _upload_resume(self, resume_path: str) -> None:
        """Upload a resume file using detected file input."""
        for selector in COMMON_FORM_SELECTORS["resume"]:
            try:
                file_input = self._page.locator(selector).first
                await file_input.set_input_files(resume_path)
                logger.info("Resume uploaded via %s", selector)
                await self._page.wait_for_timeout(1000)
                return
            except Exception:
                continue
        logger.warning("Could not find file upload input for resume")

    async def handle_multi_step_form(
        self, portal: str, candidate_data: dict[str, str], *, resume_path: str | None = None
    ) -> bool:
        """Handle multi-step application forms (e.g. LinkedIn Easy Apply)."""
        selectors = PORTAL_SELECTORS.get(portal, {})
        next_btn_sel = selectors.get("next_button")
        review_btn_sel = selectors.get("review_button")
        submit_btn_sel = selectors.get("submit_button")

        max_steps = 8
        for step in range(max_steps):
            logger.info("Processing form step %d for %s", step + 1, portal)
            await self._page.wait_for_timeout(random.randint(500, 1500))

            await self.fill_application_form(
                candidate_data, resume_path=resume_path if step == 0 else None
            )

            if submit_btn_sel:
                try:
                    submit_btn = self._page.locator(submit_btn_sel).first
                    if await submit_btn.is_visible(timeout=2000):
                        await submit_btn.click()
                        await self._page.wait_for_timeout(2000)
                        return True
                except Exception:
                    pass

            if review_btn_sel:
                try:
                    review_btn = self._page.locator(review_btn_sel).first
                    if await review_btn.is_visible(timeout=2000):
                        await review_btn.click()
                        await self._page.wait_for_timeout(1500)
                        continue
                except Exception:
                    pass

            if next_btn_sel:
                try:
                    next_btn = self._page.locator(next_btn_sel).first
                    if await next_btn.is_visible(timeout=2000):
                        await next_btn.click()
                        await self._page.wait_for_timeout(1500)
                        continue
                except Exception:
                    pass

            logger.warning("No navigation button found at step %d", step + 1)
            break

        logger.warning("Multi-step form did not reach submission for %s", portal)
        await self.take_screenshot(f"multistep_incomplete_{portal}")
        return False

    async def submit_application(self, portal: str | None = None) -> bool:
        """Click the submit / apply button and return success status."""
        if not self._page:
            raise RuntimeError("Browser not launched")

        portal_specific = []
        if portal and portal in PORTAL_SELECTORS:
            sel = PORTAL_SELECTORS[portal]
            if "submit_button" in sel:
                portal_specific.append(sel["submit_button"])
            if "apply_button" in sel:
                portal_specific.append(sel["apply_button"])

        generic_selectors = [
            'button[type="submit"]',
            'button:has-text("Apply")',
            'button:has-text("Submit")',
            'button:has-text("Submit Application")',
            'button:has-text("Apply Now")',
            'input[type="submit"]',
        ]

        for sel in portal_specific + generic_selectors:
            try:
                btn = self._page.locator(sel).first
                if await btn.is_visible(timeout=2000):
                    await btn.click()
                    await self._page.wait_for_load_state("networkidle")
                    await self._page.wait_for_timeout(2000)

                    confirmation = PORTAL_SELECTORS.get(portal or "", {}).get("confirmation_text")
                    if confirmation:
                        try:
                            await self._page.wait_for_selector(
                                f'text="{confirmation}"', timeout=5000
                            )
                            logger.info("Application confirmed: %s", confirmation)
                        except Exception:
                            logger.warning("Confirmation text not found, application may have succeeded")

                    return True
            except Exception:
                continue

        await self.take_screenshot(f"submit_failed_{portal or 'unknown'}")
        return False

    async def apply_via_browser(
        self,
        portal: str,
        job_url: str,
        credentials: dict[str, str],
        candidate_data: dict[str, str],
        *,
        resume_path: str | None = None,
        cover_letter: str | None = None,
    ) -> dict[str, Any]:
        """End-to-end browser-based application flow."""
        try:
            await self.launch_browser()
            has_cookie = await self._apply_session_cookies(portal, credentials)

            email = credentials.get("email", "")
            password = credentials.get("password", "")
            if has_cookie:
                # A session cookie skips the login form entirely (and its captchas).
                logger.info("Using stored %s session cookie, skipping password login", portal)
            elif email and password:
                logged_in, reason = await self.login_to_portal_detailed(
                    portal, email=email, password=password
                )
                if not logged_in:
                    return {
                        "success": False,
                        "message": (
                            f"{portal} login was blocked ({reason}). "
                            f"Add a session cookie to the {portal} connection to skip login."
                        ),
                    }
            else:
                return {
                    "success": False,
                    "message": f"Reconnect {portal} with email/password or a session cookie.",
                }

            await self.navigate_to_job(job_url)

            selectors = PORTAL_SELECTORS.get(portal, {})
            apply_btn_sel = selectors.get("apply_button") or selectors.get("easy_apply_button")
            if apply_btn_sel:
                try:
                    apply_btn = self._page.locator(apply_btn_sel).first
                    if await apply_btn.is_visible(timeout=5000):
                        await apply_btn.click()
                        await self._page.wait_for_timeout(2000)
                except Exception:
                    logger.warning("Apply button not found, proceeding with form fill")

            if portal == "linkedin":
                success = await self.handle_multi_step_form(
                    portal, candidate_data, resume_path=resume_path
                )
            else:
                await self.fill_application_form(
                    candidate_data, resume_path=resume_path, cover_letter=cover_letter
                )
                success = await self.submit_application(portal)

            if success:
                screenshot_path = await self.take_screenshot(f"applied_{portal}")
                return {
                    "success": True,
                    "message": f"Applied via browser on {portal}",
                    "screenshot": str(screenshot_path) if screenshot_path else None,
                }
            else:
                await self.take_screenshot(f"apply_failed_{portal}")
                return {"success": False, "message": f"Browser apply to {portal} failed at submission"}

        except Exception as exc:
            logger.exception("Browser apply failed for %s", portal)
            await self.take_screenshot(f"error_{portal}")
            return {"success": False, "message": f"Browser apply error: {exc}"}

        finally:
            await self.close()

    async def take_screenshot(self, label: str) -> Path | None:
        """Save a debug screenshot with a unique name."""
        if not self._page:
            return None
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
        path = SCREENSHOT_DIR / f"{label}_{timestamp}_{uuid.uuid4().hex[:8]}.png"
        try:
            await self._page.screenshot(path=str(path), full_page=True)
            logger.info("Screenshot saved to %s", path)
            return path
        except Exception:
            logger.warning("Failed to capture screenshot")
            return None

    async def close(self) -> None:
        """Shut down the browser and Playwright."""
        if self._browser:
            await self._browser.close()
            self._browser = None
            self._context = None
            self._page = None
        if self._playwright:
            await self._playwright.stop()
            self._playwright = None
