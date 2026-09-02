import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.profiles import get_or_create_candidate_profile
from app.core.security import decrypt_credentials, encrypt_credentials, require_active_candidate, require_activated_candidate
from app.models.candidate import CandidateProfile
from app.models.portal import PortalConnection
from app.models.user import User
from app.services.portal_adapters import get_adapter

router = APIRouter(prefix="/portals", tags=["portals"])


class PortalConnectRequest(BaseModel):
    portal: str
    credentials: dict


class PortalUpdateRequest(BaseModel):
    credentials: dict | None = None
    is_active: bool | None = None


class PortalResponse(BaseModel):
    id: UUID
    candidate_id: UUID
    portal: str
    is_active: bool
    last_synced: str | None

    model_config = {"from_attributes": True}


async def _get_profile(db: AsyncSession, user: User) -> CandidateProfile:
    return await get_or_create_candidate_profile(db, user)


@router.get("/", response_model=list[PortalResponse])
async def list_portals(
    current_user: User = Depends(require_activated_candidate),
    db: AsyncSession = Depends(get_db),
) -> list[PortalConnection]:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(PortalConnection).where(PortalConnection.candidate_id == profile.id)
    )
    return list(result.scalars().all())


@router.post("/", response_model=PortalResponse, status_code=status.HTTP_201_CREATED)
async def connect_portal(
    body: PortalConnectRequest,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> PortalConnection:
    profile = await _get_profile(db, current_user)

    existing = await db.execute(
        select(PortalConnection).where(
            PortalConnection.candidate_id == profile.id,
            PortalConnection.portal == body.portal,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Portal '{body.portal}' already connected",
        )

    connection = PortalConnection(
        candidate_id=profile.id,
        portal=body.portal,
        credentials_encrypted=encrypt_credentials(json.dumps(body.credentials)),
    )
    db.add(connection)
    await db.flush()
    await db.refresh(connection)
    return connection


@router.put("/{portal_id}", response_model=PortalResponse)
async def update_portal(
    portal_id: UUID,
    body: PortalUpdateRequest,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> PortalConnection:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(PortalConnection).where(
            PortalConnection.id == portal_id,
            PortalConnection.candidate_id == profile.id,
        )
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal not found")

    if body.credentials is not None:
        connection.credentials_encrypted = encrypt_credentials(json.dumps(body.credentials))
    if body.is_active is not None:
        connection.is_active = body.is_active

    await db.flush()
    await db.refresh(connection)
    return connection


@router.delete("/{portal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_portal(
    portal_id: UUID,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> None:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(PortalConnection).where(
            PortalConnection.id == portal_id,
            PortalConnection.candidate_id == profile.id,
        )
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal not found")

    await db.delete(connection)


@router.post("/{portal_id}/test")
async def test_portal(
    portal_id: UUID,
    current_user: User = Depends(require_active_candidate),
    db: AsyncSession = Depends(get_db),
) -> dict:
    profile = await _get_profile(db, current_user)
    result = await db.execute(
        select(PortalConnection).where(
            PortalConnection.id == portal_id,
            PortalConnection.candidate_id == profile.id,
        )
    )
    connection = result.scalar_one_or_none()
    if not connection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Portal not found")

    try:
        adapter = get_adapter(connection.portal)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"No adapter available for portal '{connection.portal}'",
        )

    credentials = json.loads(decrypt_credentials(connection.credentials_encrypted))
    ok = await adapter.test_connection(credentials)
    detail = getattr(adapter, "last_message", "") or (
        "Connection successful" if ok else "Could not verify credentials"
    )

    return {
        "status": "ok" if ok else "error",
        "portal": connection.portal,
        "message": detail,
    }
