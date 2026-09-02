import logging

import resend

from app.core.config import settings

logger = logging.getLogger(__name__)


def send_email(*, to: str, subject: str, html: str) -> str | None:
    if not settings.RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not set")
    resend.api_key = settings.RESEND_API_KEY
    payload: dict = {
        "from": settings.EMAIL_FROM,
        "to": [to],
        "subject": subject,
        "html": html,
    }
    if settings.EMAIL_REPLY_TO:
        payload["reply_to"] = [settings.EMAIL_REPLY_TO]
    result = resend.Emails.send(payload)
    email_id = result.get("id") if isinstance(result, dict) else None
    logger.info("Sent email to %s (%s) id=%s", to, subject, email_id)
    return email_id


def send_email_otp(email: str, code: str) -> None:
    send_email(
        to=email,
        subject=f"{code} is your AutoApply verification code",
        html=f"""
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <h1 style="font-size:22px">Verify your email</h1>
          <p>Use this 6-digit code to create your AutoApply account. It expires in 10 minutes.</p>
          <p style="font-size:32px;letter-spacing:8px;font-weight:700">{code}</p>
          <p>After verification, an admin still needs to send an invite code before premium features (job fetch, apply, Auto-Apply) unlock.</p>
          <p style="color:#666;font-size:13px">— AutoApply</p>
        </div>
        """,
    )


def send_candidate_welcome(email: str) -> None:
    try:
        activate_url = f"{settings.APP_URL.rstrip('/')}/activate"
        send_email(
            to=email,
            subject="Welcome to AutoApply — activate your account",
            html=f"""
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <h1 style="font-size:22px">Welcome to AutoApply</h1>
          <p>Your email is verified and your account exists. Premium features stay locked until an admin sends you a one-time invite code.</p>
          <p>After you have the code, open <a href="{activate_url}">{activate_url}</a> and enter it.</p>
          <p>Need a code? Reply to this email or WhatsApp 9875407603.</p>
          <p style="color:#666;font-size:13px">— AutoApply</p>
        </div>
        """,
        )
    except Exception:
        logger.exception("Welcome email failed for %s", email)


def send_admin_new_candidate(email: str) -> None:
    if not settings.ADMIN_NOTIFY_EMAIL:
        return
    try:
        send_email(
            to=settings.ADMIN_NOTIFY_EMAIL,
            subject=f"New candidate signup: {email}",
            html=f"""
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <h1 style="font-size:22px">New candidate onboarding</h1>
          <p><strong>{email}</strong> just signed up and is waiting for an invite code.</p>
          <p>Generate a code in Admin → Invite codes, then send it to them.</p>
        </div>
        """,
        )
    except Exception:
        logger.exception("Admin notify email failed for %s", email)


def send_candidate_activated(email: str) -> None:
    try:
        dashboard_url = f"{settings.APP_URL.rstrip('/')}/candidate/dashboard"
        send_email(
            to=email,
            subject="Your AutoApply account is active",
            html=f"""
        <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
          <h1 style="font-size:22px">You're in</h1>
          <p>Your admin invite code was accepted. Premium features are unlocked — connect portals, set preferences, and fetch jobs.</p>
          <p><a href="{dashboard_url}">Open your dashboard</a></p>
        </div>
        """,
        )
    except Exception:
        logger.exception("Activation email failed for %s", email)
