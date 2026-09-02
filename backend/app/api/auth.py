from datetime import datetime, timedelta, timezone
from uuid import UUID
import hashlib
import re
import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from app.core.config import settings
from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    get_optional_user,
    hash_password,
    verify_password,
    verify_token,
)
from app.models.candidate import CandidateProfile
from app.models.invite import InviteCode
from app.models.user import User
from app.services.email import (
    send_admin_new_candidate,
    send_candidate_activated,
    send_candidate_welcome,
    send_email_otp,
)

router = APIRouter(prefix="/auth", tags=["auth"])
logger = logging.getLogger(__name__)


OTP_TTL = timedelta(minutes=10)
OTP_MAX_ATTEMPTS = 5


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    role: str = "candidate"


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=8)


class ResendOtpRequest(BaseModel):
    email: EmailStr


class RegisterStartedResponse(BaseModel):
    message: str
    email: str
    expires_in_seconds: int


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ActivateRequest(BaseModel):
    code: str = Field(min_length=4, max_length=32)
    email: EmailStr | None = None
    password: str | None = None


def _normalize_invite_code(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9]", "", raw or "").upper()


def _hash_otp(email: str, code: str) -> str:
    payload = f"{email.strip().lower()}:{code.strip()}:{settings.SECRET_KEY}"
    return hashlib.sha256(payload.encode()).hexdigest()


def _new_otp() -> str:
    return f"{secrets.randbelow(900000) + 100000:d}"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    account_status: str


class UserResponse(BaseModel):
    id: UUID
    email: str
    role: str
    is_active: bool
    account_status: str
    auto_apply_allowed: bool | None = None
    auto_apply_enabled: bool | None = None

    model_config = {"from_attributes": True}


def _token_payload(user: User) -> dict:
    return {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "account_status": user.account_status,
    }


def _tokens(user: User) -> TokenResponse:
    data = _token_payload(user)
    return TokenResponse(
        access_token=create_access_token(data),
        refresh_token=create_refresh_token(data),
        role=user.role,
        account_status=user.account_status,
    )


async def _get_user_by_email(db: AsyncSession, email: str) -> User | None:
    normalized = email.strip().lower()
    return (
        await db.execute(select(User).where(func.lower(User.email) == normalized))
    ).scalar_one_or_none()


def _assign_otp(user: User, email: str, otp: str) -> None:
    user.otp_hash = _hash_otp(email, otp)
    user.otp_attempts = 0
    user.otp_expires_at = datetime.now(timezone.utc) + OTP_TTL


@router.post("/register", response_model=RegisterStartedResponse)
async def register(
    body: RegisterRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RegisterStartedResponse:
    if body.role != "candidate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public registration is limited to candidates",
        )
    if len(body.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 6 characters",
        )

    email = str(body.email).strip().lower()
    user = await _get_user_by_email(db, email)
    if user and user.account_status not in {"pending"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered. Sign in instead.",
        )
    if user is None:
        user = User(
            email=email,
            password_hash=hash_password(body.password),
            role="candidate",
            account_status="pending",
            is_active=True,
            email_verified=False,
        )
        db.add(user)
        await db.flush()
        await get_or_create_candidate_profile(db, user)
    else:
        user.password_hash = hash_password(body.password)
        user.email_verified = False

    otp = _new_otp()
    _assign_otp(user, email, otp)
    await db.flush()
    await db.commit()

    try:
        send_email_otp(email, otp)
    except Exception as exc:
        logger.exception("OTP email failed for %s", email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not send the verification email. {exc}",
        ) from exc
    return RegisterStartedResponse(
        message="Account created. We sent a 6-digit code to your email.",
        email=email,
        expires_in_seconds=int(OTP_TTL.total_seconds()),
    )


@router.post("/resend-otp", response_model=RegisterStartedResponse)
async def resend_otp(
    body: ResendOtpRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> RegisterStartedResponse:
    email = str(body.email).strip().lower()
    user = await _get_user_by_email(db, email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No account found for this email. Register first.",
        )
    if user.account_status not in {"pending"} and user.email_verified:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This email already has an account. Sign in instead.",
        )

    otp = _new_otp()
    _assign_otp(user, email, otp)
    await db.flush()
    await db.commit()
    try:
        send_email_otp(email, otp)
    except Exception as exc:
        logger.exception("OTP email failed for %s", email)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Could not send the verification email. {exc}",
        ) from exc
    return RegisterStartedResponse(
        message="A new 6-digit code was sent to your email.",
        email=email,
        expires_in_seconds=int(OTP_TTL.total_seconds()),
    )


@router.post("/verify-email", response_model=TokenResponse)
async def verify_email(
    body: VerifyEmailRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    email = str(body.email).strip().lower()
    code = re.sub(r"\D", "", body.code)
    user = await _get_user_by_email(db, email)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No account found for this email. Register first.",
        )
    if user.account_status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is suspended",
        )
    await get_or_create_candidate_profile(db, user)
    if user.email_verified:
        return _tokens(user)

    expires_at = user.otp_expires_at
    if expires_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code is no longer active. Request a new verification code.",
        )
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="That code expired. Request a new one.",
        )
    if user.otp_attempts >= OTP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many attempts. Request a new code.",
        )
    if not user.otp_hash or user.otp_hash != _hash_otp(email, code):
        user.otp_attempts += 1
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect verification code. Check your email and try again.",
        )

    first_verify = not user.email_verified
    user.email_verified = True
    user.otp_hash = None
    user.otp_attempts = 0
    user.otp_expires_at = None
    await db.flush()

    if first_verify:
        background_tasks.add_task(send_candidate_welcome, user.email)
        background_tasks.add_task(send_admin_new_candidate, user.email)
    return _tokens(user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    email = str(body.email).strip().lower()
    user = await _get_user_by_email(db, email)
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    if not user.is_active or user.account_status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Account is suspended"
        )

    await get_or_create_candidate_profile(db, user)
    return _tokens(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)) -> TokenResponse:
    payload = verify_token(body.refresh_token, expected_type="refresh")
    user_id = payload.get("sub")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user or not user.is_active or user.account_status == "suspended":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user")

    return _tokens(user)


@router.post("/activate", response_model=TokenResponse)
async def activate(
    body: ActivateRequest,
    background_tasks: BackgroundTasks,
    token_user: User | None = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    current_user = token_user if token_user and token_user.role == "candidate" else None

    if current_user is None:
        if not body.email or not body.password:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Sign in with your candidate email and password, then enter the invite code.",
            )
        result = await db.execute(select(User).where(func.lower(User.email) == str(body.email).strip().lower()))
        current_user = result.scalar_one_or_none()
        if (
            current_user is None
            or not verify_password(body.password, current_user.password_hash)
            or current_user.role != "candidate"
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect email or password",
            )
        if not current_user.is_active or current_user.account_status == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is suspended",
            )
    if current_user.role != "candidate":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only candidates can activate")
    if current_user.account_status != "pending":
        return _tokens(current_user)

    code = _normalize_invite_code(body.code)
    if len(code) < 4:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect invite code. Contact admin for a valid code.",
        )

    result = await db.execute(
        select(InviteCode).where(func.upper(InviteCode.code) == code)
    )
    invite = result.scalar_one_or_none()
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect invite code. Contact admin for a valid code.",
        )
    if invite.used_by is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This invite code was already used. Ask admin for a new one.",
        )

    invite.used_by = current_user.id
    invite.used_at = datetime.now(timezone.utc)
    current_user.account_status = "active"
    await db.flush()
    await db.commit()
    await db.refresh(current_user)
    background_tasks.add_task(send_candidate_activated, current_user.email)
    return _tokens(current_user)


@router.get("/me", response_model=UserResponse)
async def me(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserResponse:
    allowed = None
    enabled = None
    if current_user.role == "candidate":
        result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
        )
        profile = result.scalar_one_or_none()
        if profile:
            allowed = profile.auto_apply_allowed
            enabled = profile.auto_apply_enabled
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        role=current_user.role,
        is_active=current_user.is_active,
        account_status=current_user.account_status,
        auto_apply_allowed=allowed,
        auto_apply_enabled=enabled,
    )
