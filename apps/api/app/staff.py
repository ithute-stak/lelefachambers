from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.main import User, audit, current_user, get_db, hash_password


router = APIRouter(prefix="/api/v1/admin/staff", tags=["staff"])

StaffRole = Literal[
    "system_owner",
    "chambers_admin",
    "managing_advocate",
    "advocate",
    "content_editor",
    "reception",
    "auditor",
]

ROLE_CATALOG: list[dict[str, str]] = [
    {"value": "system_owner", "label": "System owner", "description": "Full platform control, including staff administration."},
    {"value": "chambers_admin", "label": "Chambers administrator", "description": "Chambers administration, content, consultations and staff management."},
    {"value": "managing_advocate", "label": "Managing advocate", "description": "Legal operations oversight, publishing and consultation management."},
    {"value": "advocate", "label": "Advocate", "description": "Legal work, consultation review and controlled content access."},
    {"value": "content_editor", "label": "Content editor", "description": "Draft and submit website content and media."},
    {"value": "reception", "label": "Reception", "description": "Consultation intake, scheduling and public-information access."},
    {"value": "auditor", "label": "Auditor", "description": "Read-only access to controlled records and audit history."},
]


class StaffCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    role: StaffRole
    password: str = Field(min_length=12, max_length=200)


class StaffUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=255)
    role: StaffRole | None = None
    is_active: bool | None = None


class StaffPasswordReset(BaseModel):
    new_password: str = Field(min_length=12, max_length=200)


def staff_view(user: User) -> dict[str, object]:
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "role": user.role,
        "is_active": user.is_active,
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "updated_at": user.updated_at.isoformat() if user.updated_at else None,
    }


def staff_admin(actor: User = Depends(current_user)) -> User:
    if actor.role not in {"system_owner", "chambers_admin"}:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff administration permission required")
    return actor


def ensure_can_manage(actor: User, target: User | None = None, requested_role: str | None = None) -> None:
    if actor.role == "system_owner":
        return
    if requested_role == "system_owner" or (target and target.role == "system_owner"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the system owner can manage system-owner accounts")


@router.get("/roles")
def staff_roles(actor: User = Depends(staff_admin)):
    roles = ROLE_CATALOG
    if actor.role != "system_owner":
        roles = [role for role in roles if role["value"] != "system_owner"]
    return roles


@router.get("")
def list_staff(db: Session = Depends(get_db), actor: User = Depends(staff_admin)):
    rows = db.scalars(select(User).order_by(User.is_active.desc(), User.full_name, User.email)).all()
    return [staff_view(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_staff(
    payload: StaffCreate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(staff_admin),
):
    ensure_can_manage(actor, requested_role=payload.role)
    email = str(payload.email).strip().lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A staff account already uses this email address")

    item = User(
        email=email,
        full_name=payload.full_name.strip(),
        role=payload.role,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(item)
    db.flush()
    after = staff_view(item)
    audit(db, request, actor, "staff.created", "user", str(item.id), after=after)
    db.commit()
    return after


@router.patch("/{staff_id}")
def update_staff(
    staff_id: int,
    payload: StaffUpdate,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(staff_admin),
):
    item = db.get(User, staff_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found")

    ensure_can_manage(actor, target=item, requested_role=payload.role)
    if item.id == actor.id and payload.is_active is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot deactivate your own account")
    if item.id == actor.id and payload.role is not None and payload.role != item.role:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot change your own role")

    before = staff_view(item)
    if payload.full_name is not None:
        item.full_name = payload.full_name.strip()
    if payload.role is not None:
        item.role = payload.role
    if payload.is_active is not None:
        item.is_active = payload.is_active

    after = staff_view(item)
    audit(db, request, actor, "staff.updated", "user", str(item.id), before=before, after=after)
    db.commit()
    return after


@router.post("/{staff_id}/reset-password")
def reset_staff_password(
    staff_id: int,
    payload: StaffPasswordReset,
    request: Request,
    db: Session = Depends(get_db),
    actor: User = Depends(staff_admin),
):
    item = db.get(User, staff_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff account not found")

    ensure_can_manage(actor, target=item)
    item.password_hash = hash_password(payload.new_password)
    audit(
        db,
        request,
        actor,
        "staff.password_reset",
        "user",
        str(item.id),
        before={"id": item.id, "email": item.email},
        after={"id": item.id, "email": item.email, "password_reset": True},
    )
    db.commit()
    return {"status": "ok", "message": "Temporary password updated"}
