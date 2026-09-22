from __future__ import annotations

import hashlib
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

import jwt
from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.main import (
    Base,
    TimestampMixin,
    User,
    audit,
    current_user,
    get_db,
    hash_password,
    model_dict,
    settings,
    verify_password,
)
from app.operations import Client, Matter

router = APIRouter(prefix="/api/v1", tags=["legal-recovery"])


# -----------------------------------------------------------------------------
# Private legal-recovery data model
# -----------------------------------------------------------------------------


class MatterDocument(TimestampMixin, Base):
    __tablename__ = "matter_documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    category: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_name: Mapped[str] = mapped_column(String(255), nullable=False)
    stored_name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    checksum_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    visibility: Mapped[str] = mapped_column(String(24), default="internal", index=True, nullable=False)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class Settlement(TimestampMixin, Base):
    __tablename__ = "matter_settlements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    settlement_reference: Mapped[str] = mapped_column(String(80), unique=True, index=True, nullable=False)
    agreed_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="LSL", nullable=False)
    accepted_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    first_due_date: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    installment_amount: Mapped[Decimal | None] = mapped_column(Numeric(18, 2), nullable=True)
    frequency: Mapped[str | None] = mapped_column(String(40), nullable=True)
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="proposed", index=True, nullable=False)
    recorded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class Judgment(TimestampMixin, Base):
    __tablename__ = "matter_judgments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    judgment_reference: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    judgment_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    court_name: Mapped[str] = mapped_column(String(255), nullable=False)
    principal_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    interest_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    legal_costs_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    total_awarded: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="LSL", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="unsatisfied", index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class ExecutionAction(TimestampMixin, Base):
    __tablename__ = "execution_actions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    judgment_id: Mapped[int | None] = mapped_column(ForeignKey("matter_judgments.id"), index=True, nullable=True)
    action_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="planned", index=True, nullable=False)
    requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    officer_or_sheriff: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    target_asset_or_income: Mapped[str | None] = mapped_column(Text, nullable=True)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_step: Mapped[str | None] = mapped_column(Text, nullable=True)


class RecoveryPayment(TimestampMixin, Base):
    __tablename__ = "recovery_payments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    settlement_id: Mapped[int | None] = mapped_column(ForeignKey("matter_settlements.id"), index=True, nullable=True)
    judgment_id: Mapped[int | None] = mapped_column(ForeignKey("matter_judgments.id"), index=True, nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="LSL", nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    payment_reference: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    bank_reference: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
    channel: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source: Mapped[str] = mapped_column(String(80), default="manual", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)
    reconciliation_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    allocated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    remittance_status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)
    remittance_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    remitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ClientPortalUser(TimestampMixin, Base):
    __tablename__ = "client_portal_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("legal_clients.id"), index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(32), default="viewer", nullable=False)
    password_hash: Mapped[str] = mapped_column(String(512), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


RECOVERY_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "system_owner": {"*"},
    "chambers_admin": {
        "recovery:read", "document:*", "settlement:*", "judgment:*", "execution:*", "payment:*", "portal:*"
    },
    "managing_advocate": {
        "recovery:read", "document:*", "settlement:*", "judgment:*", "execution:*", "payment:*", "portal:*"
    },
    "advocate": {
        "recovery:read", "document:*", "settlement:*", "judgment:*", "execution:*", "payment:read", "payment:create"
    },
    "auditor": {
        "recovery:read", "document:read", "settlement:read", "judgment:read", "execution:read", "payment:read", "portal:read"
    },
    "reception": {"recovery:read", "document:read"},
}


def recovery_allows(role: str, permission: str) -> bool:
    allowed = RECOVERY_ROLE_PERMISSIONS.get(role, set())
    if "*" in allowed or permission in allowed:
        return True
    return permission.split(":", 1)[0] + ":*" in allowed


def require_recovery(permission: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if not recovery_allows(user.role, permission):
            raise HTTPException(status_code=403, detail="Insufficient legal-recovery permission")
        return user

    return dependency


def _serialize(obj: Any) -> dict[str, Any]:
    data = model_dict(obj)
    for key, value in list(data.items()):
        if isinstance(value, Decimal):
            data[key] = str(value)
        elif isinstance(value, date) and not isinstance(value, datetime):
            data[key] = value.isoformat()
    return data


def _matter_or_404(db: Session, matter_id: int) -> Matter:
    matter = db.get(Matter, matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    return matter


def _settlement_reference(db: Session, matter: Matter) -> str:
    count = db.scalar(select(func.count()).select_from(Settlement).where(Settlement.matter_id == matter.id)) or 0
    return f"{matter.matter_reference}-SET-{count + 1:03d}"


def _reconcile_matter(db: Session, matter_id: int):
    matter = _matter_or_404(db, matter_id)
    recovered = db.scalar(
        select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(
            RecoveryPayment.matter_id == matter_id,
            RecoveryPayment.status == "matched",
        )
    ) or Decimal("0.00")
    matter.recovery_amount = Decimal(recovered)

    settlements = db.scalars(select(Settlement).where(Settlement.matter_id == matter_id)).all()
    for settlement in settlements:
        paid = db.scalar(
            select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(
                RecoveryPayment.settlement_id == settlement.id,
                RecoveryPayment.status == "matched",
            )
        ) or Decimal("0.00")
        if Decimal(paid) >= Decimal(settlement.agreed_amount) and settlement.status not in {"cancelled", "rejected"}:
            settlement.status = "completed"
        elif Decimal(paid) > 0 and settlement.status in {"approved", "active", "proposed"}:
            settlement.status = "active"

    judgments = db.scalars(select(Judgment).where(Judgment.matter_id == matter_id)).all()
    for judgment in judgments:
        paid = db.scalar(
            select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(
                RecoveryPayment.judgment_id == judgment.id,
                RecoveryPayment.status == "matched",
            )
        ) or Decimal("0.00")
        if Decimal(paid) >= Decimal(judgment.total_awarded) and judgment.status not in {"set_aside", "appealed"}:
            judgment.status = "satisfied"
        elif Decimal(paid) > 0 and judgment.status not in {"set_aside", "appealed"}:
            judgment.status = "part_satisfied"


# -----------------------------------------------------------------------------
# Input models
# -----------------------------------------------------------------------------


class SettlementInput(BaseModel):
    agreed_amount: Decimal = Field(gt=0)
    currency: str = "LSL"
    accepted_date: date | None = None
    first_due_date: date | None = None
    installment_amount: Decimal | None = Field(default=None, gt=0)
    frequency: Literal["once", "weekly", "fortnightly", "monthly", "custom"] | None = None
    terms: str | None = None
    status: Literal["proposed", "approved", "active", "completed", "defaulted", "cancelled", "rejected"] = "proposed"


class SettlementPatch(BaseModel):
    agreed_amount: Decimal | None = Field(default=None, gt=0)
    accepted_date: date | None = None
    first_due_date: date | None = None
    installment_amount: Decimal | None = Field(default=None, gt=0)
    frequency: str | None = None
    terms: str | None = None
    status: str | None = None


class JudgmentInput(BaseModel):
    judgment_reference: str
    judgment_date: date
    court_name: str
    principal_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    interest_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    legal_costs_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    total_awarded: Decimal = Field(gt=0)
    currency: str = "LSL"
    status: Literal["unsatisfied", "part_satisfied", "satisfied", "appealed", "set_aside"] = "unsatisfied"
    notes: str | None = None


class JudgmentPatch(BaseModel):
    judgment_reference: str | None = None
    judgment_date: date | None = None
    court_name: str | None = None
    principal_amount: Decimal | None = Field(default=None, ge=0)
    interest_amount: Decimal | None = Field(default=None, ge=0)
    legal_costs_amount: Decimal | None = Field(default=None, ge=0)
    total_awarded: Decimal | None = Field(default=None, gt=0)
    status: str | None = None
    notes: str | None = None


class ExecutionInput(BaseModel):
    judgment_id: int | None = None
    action_type: Literal["warrant_execution", "attachment", "garnishee", "sale_in_execution", "emolument", "other"]
    status: Literal["planned", "filed", "issued", "served", "in_progress", "completed", "unsuccessful", "stayed"] = "planned"
    requested_at: datetime | None = None
    issued_at: datetime | None = None
    officer_or_sheriff: str | None = None
    external_reference: str | None = None
    target_asset_or_income: str | None = None
    outcome: str | None = None
    next_step: str | None = None


class ExecutionPatch(BaseModel):
    status: str | None = None
    requested_at: datetime | None = None
    issued_at: datetime | None = None
    officer_or_sheriff: str | None = None
    external_reference: str | None = None
    target_asset_or_income: str | None = None
    outcome: str | None = None
    next_step: str | None = None


class PaymentInput(BaseModel):
    matter_id: int
    settlement_id: int | None = None
    judgment_id: int | None = None
    amount: Decimal = Field(gt=0)
    currency: str = "LSL"
    received_at: datetime
    payment_reference: str
    bank_reference: str | None = None
    channel: str | None = None
    payer_name: str | None = None
    source: str = "manual"
    status: Literal["pending", "matched", "unallocated", "reversed"] = "pending"
    reconciliation_note: str | None = None


class PaymentPatch(BaseModel):
    settlement_id: int | None = None
    judgment_id: int | None = None
    status: Literal["pending", "matched", "unallocated", "reversed"] | None = None
    reconciliation_note: str | None = None
    remittance_status: Literal["pending", "included", "remitted", "held"] | None = None
    remittance_reference: str | None = None


class PortalUserInput(BaseModel):
    client_id: int
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    role: Literal["manager", "legal", "finance", "viewer"] = "viewer"
    password: str = Field(min_length=12, max_length=256)
    is_active: bool = True


class PortalUserPatch(BaseModel):
    full_name: str | None = None
    role: Literal["manager", "legal", "finance", "viewer"] | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=12, max_length=256)


class PortalLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)


# -----------------------------------------------------------------------------
# Private document vault
# -----------------------------------------------------------------------------


vault_path = Path(os.environ.get("LEGAL_VAULT_DIR", "/app/legal-vault"))
vault_path.mkdir(parents=True, exist_ok=True)
MAX_VAULT_MB = int(os.environ.get("MAX_LEGAL_DOCUMENT_MB", "25"))
ALLOWED_LEGAL_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/webp",
}


@router.get("/ops/recovery/dashboard")
def recovery_dashboard(db: Session = Depends(get_db), user: User = Depends(require_recovery("recovery:read"))):
    matched_total = db.scalar(select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(RecoveryPayment.status == "matched")) or 0
    unallocated_total = db.scalar(select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(RecoveryPayment.status == "unallocated")) or 0
    return {
        "active_settlements": db.scalar(select(func.count()).select_from(Settlement).where(Settlement.status.in_(["approved", "active"]))) or 0,
        "unsatisfied_judgments": db.scalar(select(func.count()).select_from(Judgment).where(Judgment.status.in_(["unsatisfied", "part_satisfied"]))) or 0,
        "active_execution_actions": db.scalar(select(func.count()).select_from(ExecutionAction).where(ExecutionAction.status.in_(["planned", "filed", "issued", "served", "in_progress"]))) or 0,
        "unallocated_payments": db.scalar(select(func.count()).select_from(RecoveryPayment).where(RecoveryPayment.status == "unallocated")) or 0,
        "matched_recovery_total": str(matched_total),
        "unallocated_value": str(unallocated_total),
        "private_documents": db.scalar(select(func.count()).select_from(MatterDocument)) or 0,
        "portal_users": db.scalar(select(func.count()).select_from(ClientPortalUser).where(ClientPortalUser.is_active.is_(True))) or 0,
        "user": {"id": user.id, "full_name": user.full_name, "role": user.role},
    }


@router.get("/ops/recovery/alerts")
def recovery_alerts(db: Session = Depends(get_db), user: User = Depends(require_recovery("recovery:read"))):
    today = date.today()
    overdue_settlements = db.scalars(
        select(Settlement).where(
            Settlement.first_due_date.is_not(None),
            Settlement.first_due_date < today,
            Settlement.status.in_(["approved", "active"]),
        ).order_by(Settlement.first_due_date)
    ).all()
    stale_executions = db.scalars(
        select(ExecutionAction).where(
            ExecutionAction.status.in_(["issued", "served", "in_progress"]),
            ExecutionAction.updated_at < datetime.now(timezone.utc) - timedelta(days=14),
        ).order_by(ExecutionAction.updated_at)
    ).all()
    return {
        "overdue_settlements": [_serialize(item) for item in overdue_settlements],
        "stale_execution_actions": [_serialize(item) for item in stale_executions],
    }


@router.get("/ops/matters/{matter_id}/documents")
def list_matter_documents(matter_id: int, db: Session = Depends(get_db), user: User = Depends(require_recovery("document:read"))):
    _matter_or_404(db, matter_id)
    rows = db.scalars(select(MatterDocument).where(MatterDocument.matter_id == matter_id).order_by(MatterDocument.created_at.desc())).all()
    return [_serialize(row) for row in rows]


@router.post("/ops/matters/{matter_id}/documents", status_code=201)
async def upload_matter_document(
    matter_id: int,
    request: Request,
    category: str = Form(...),
    title: str = Form(...),
    visibility: str = Form("internal"),
    description: str | None = Form(default=None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_recovery("document:create")),
):
    _matter_or_404(db, matter_id)
    if visibility not in {"internal", "client"}:
        raise HTTPException(status_code=422, detail="Visibility must be internal or client")
    if file.content_type not in ALLOWED_LEGAL_TYPES:
        raise HTTPException(status_code=415, detail="Unsupported legal-document type")
    content = await file.read()
    if len(content) > MAX_VAULT_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Legal document exceeds upload limit")
    extension = Path(file.filename or "document").suffix.lower()
    stored_name = f"{secrets.token_hex(24)}{extension}"
    target = vault_path / stored_name
    target.write_bytes(content)
    item = MatterDocument(
        matter_id=matter_id,
        category=category.strip(),
        title=title.strip(),
        description=description,
        original_name=file.filename or stored_name,
        stored_name=stored_name,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(content),
        checksum_sha256=hashlib.sha256(content).hexdigest(),
        visibility=visibility,
        uploaded_by_id=user.id,
    )
    db.add(item); db.flush()
    audit(db, request, user, "matter_document.uploaded", "matter_document", str(item.id), after={"matter_id": matter_id, "title": item.title, "category": item.category, "visibility": item.visibility, "checksum_sha256": item.checksum_sha256})
    db.commit()
    return _serialize(item)


@router.get("/ops/documents/{document_id}/download")
def download_matter_document(document_id: int, db: Session = Depends(get_db), user: User = Depends(require_recovery("document:read"))):
    item = db.get(MatterDocument, document_id)
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    target = vault_path / item.stored_name
    if not target.exists():
        raise HTTPException(status_code=410, detail="Document file is unavailable")
    return FileResponse(path=target, media_type=item.content_type, filename=item.original_name)


@router.delete("/ops/documents/{document_id}", status_code=204)
def delete_matter_document(document_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("document:delete"))):
    item = db.get(MatterDocument, document_id)
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    before = _serialize(item)
    target = vault_path / item.stored_name
    if target.exists():
        target.unlink()
    db.delete(item)
    audit(db, request, user, "matter_document.deleted", "matter_document", str(document_id), before=before)
    db.commit()
    return None


# -----------------------------------------------------------------------------
# Settlements, judgments, execution and payment reconciliation
# -----------------------------------------------------------------------------


@router.get("/ops/settlements")
def list_settlements(matter_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_recovery("settlement:read"))):
    stmt = select(Settlement).order_by(Settlement.updated_at.desc())
    if matter_id:
        stmt = stmt.where(Settlement.matter_id == matter_id)
    result = []
    for row in db.scalars(stmt).all():
        data = _serialize(row)
        matter = db.get(Matter, row.matter_id)
        data["matter_reference"] = matter.matter_reference if matter else None
        data["matter_title"] = matter.title if matter else None
        paid = db.scalar(select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(RecoveryPayment.settlement_id == row.id, RecoveryPayment.status == "matched")) or 0
        data["paid_amount"] = str(paid)
        data["remaining_amount"] = str(max(Decimal(row.agreed_amount) - Decimal(paid), Decimal("0.00")))
        result.append(data)
    return result


@router.post("/ops/matters/{matter_id}/settlements", status_code=201)
def create_settlement(matter_id: int, payload: SettlementInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("settlement:create"))):
    matter = _matter_or_404(db, matter_id)
    item = Settlement(matter_id=matter_id, settlement_reference=_settlement_reference(db, matter), recorded_by_id=user.id, **payload.model_dump())
    db.add(item); db.flush()
    audit(db, request, user, "settlement.created", "settlement", str(item.id), after=_serialize(item))
    db.commit(); return _serialize(item)


@router.patch("/ops/settlements/{settlement_id}")
def update_settlement(settlement_id: int, payload: SettlementPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("settlement:update"))):
    item = db.get(Settlement, settlement_id)
    if not item:
        raise HTTPException(status_code=404, detail="Settlement not found")
    before = _serialize(item)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    audit(db, request, user, "settlement.updated", "settlement", str(item.id), before=before, after=_serialize(item))
    db.commit(); return _serialize(item)


@router.get("/ops/judgments")
def list_judgments(matter_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_recovery("judgment:read"))):
    stmt = select(Judgment).order_by(Judgment.judgment_date.desc())
    if matter_id:
        stmt = stmt.where(Judgment.matter_id == matter_id)
    result = []
    for row in db.scalars(stmt).all():
        data = _serialize(row)
        matter = db.get(Matter, row.matter_id)
        data["matter_reference"] = matter.matter_reference if matter else None
        paid = db.scalar(select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(RecoveryPayment.judgment_id == row.id, RecoveryPayment.status == "matched")) or 0
        data["paid_amount"] = str(paid)
        data["balance"] = str(max(Decimal(row.total_awarded) - Decimal(paid), Decimal("0.00")))
        result.append(data)
    return result


@router.post("/ops/matters/{matter_id}/judgments", status_code=201)
def create_judgment(matter_id: int, payload: JudgmentInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("judgment:create"))):
    matter = _matter_or_404(db, matter_id)
    item = Judgment(matter_id=matter_id, **payload.model_dump())
    db.add(item); db.flush()
    if matter.stage not in {"execution", "closed"}:
        matter.stage = "judgment"
    audit(db, request, user, "judgment.created", "judgment", str(item.id), after=_serialize(item))
    db.commit(); return _serialize(item)


@router.patch("/ops/judgments/{judgment_id}")
def update_judgment(judgment_id: int, payload: JudgmentPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("judgment:update"))):
    item = db.get(Judgment, judgment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Judgment not found")
    before = _serialize(item)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    audit(db, request, user, "judgment.updated", "judgment", str(item.id), before=before, after=_serialize(item))
    db.commit(); return _serialize(item)


@router.get("/ops/executions")
def list_executions(matter_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_recovery("execution:read"))):
    stmt = select(ExecutionAction).order_by(ExecutionAction.updated_at.desc())
    if matter_id:
        stmt = stmt.where(ExecutionAction.matter_id == matter_id)
    result = []
    for row in db.scalars(stmt).all():
        data = _serialize(row)
        matter = db.get(Matter, row.matter_id)
        data["matter_reference"] = matter.matter_reference if matter else None
        result.append(data)
    return result


@router.post("/ops/matters/{matter_id}/executions", status_code=201)
def create_execution(matter_id: int, payload: ExecutionInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("execution:create"))):
    matter = _matter_or_404(db, matter_id)
    if payload.judgment_id:
        judgment = db.get(Judgment, payload.judgment_id)
        if not judgment or judgment.matter_id != matter_id:
            raise HTTPException(status_code=422, detail="Judgment does not belong to this matter")
    item = ExecutionAction(matter_id=matter_id, **payload.model_dump())
    db.add(item); db.flush(); matter.stage = "execution"
    audit(db, request, user, "execution.created", "execution_action", str(item.id), after=_serialize(item))
    db.commit(); return _serialize(item)


@router.patch("/ops/executions/{execution_id}")
def update_execution(execution_id: int, payload: ExecutionPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("execution:update"))):
    item = db.get(ExecutionAction, execution_id)
    if not item:
        raise HTTPException(status_code=404, detail="Execution action not found")
    before = _serialize(item)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    audit(db, request, user, "execution.updated", "execution_action", str(item.id), before=before, after=_serialize(item))
    db.commit(); return _serialize(item)


@router.get("/ops/recovery-payments")
def list_recovery_payments(matter_id: int | None = None, status: str | None = None, db: Session = Depends(get_db), user: User = Depends(require_recovery("payment:read"))):
    stmt = select(RecoveryPayment).order_by(RecoveryPayment.received_at.desc())
    if matter_id:
        stmt = stmt.where(RecoveryPayment.matter_id == matter_id)
    if status:
        stmt = stmt.where(RecoveryPayment.status == status)
    return [_serialize(row) for row in db.scalars(stmt).all()]


@router.post("/ops/recovery-payments", status_code=201)
def create_recovery_payment(payload: PaymentInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("payment:create"))):
    _matter_or_404(db, payload.matter_id)
    if payload.settlement_id:
        settlement = db.get(Settlement, payload.settlement_id)
        if not settlement or settlement.matter_id != payload.matter_id:
            raise HTTPException(status_code=422, detail="Settlement does not belong to matter")
    if payload.judgment_id:
        judgment = db.get(Judgment, payload.judgment_id)
        if not judgment or judgment.matter_id != payload.matter_id:
            raise HTTPException(status_code=422, detail="Judgment does not belong to matter")
    item = RecoveryPayment(**payload.model_dump(), allocated_by_id=user.id if payload.status == "matched" else None)
    db.add(item); db.flush(); _reconcile_matter(db, payload.matter_id)
    audit(db, request, user, "recovery_payment.created", "recovery_payment", str(item.id), after=_serialize(item))
    db.commit(); return _serialize(item)


@router.patch("/ops/recovery-payments/{payment_id}")
def update_recovery_payment(payment_id: int, payload: PaymentPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("payment:update"))):
    item = db.get(RecoveryPayment, payment_id)
    if not item:
        raise HTTPException(status_code=404, detail="Recovery payment not found")
    before = _serialize(item)
    changes = payload.model_dump(exclude_unset=True)
    if "settlement_id" in changes and changes["settlement_id"] is not None:
        settlement = db.get(Settlement, changes["settlement_id"])
        if not settlement or settlement.matter_id != item.matter_id:
            raise HTTPException(status_code=422, detail="Settlement does not belong to matter")
    if "judgment_id" in changes and changes["judgment_id"] is not None:
        judgment = db.get(Judgment, changes["judgment_id"])
        if not judgment or judgment.matter_id != item.matter_id:
            raise HTTPException(status_code=422, detail="Judgment does not belong to matter")
    for key, value in changes.items():
        setattr(item, key, value)
    if changes.get("status") == "matched":
        item.allocated_by_id = user.id
    if changes.get("remittance_status") == "remitted":
        item.remitted_at = datetime.now(timezone.utc)
    _reconcile_matter(db, item.matter_id)
    audit(db, request, user, "recovery_payment.updated", "recovery_payment", str(item.id), before=before, after=_serialize(item))
    db.commit(); return _serialize(item)


# -----------------------------------------------------------------------------
# Institutional client portal
# -----------------------------------------------------------------------------


def _create_portal_token(user: ClientPortalUser) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "kind": "client_portal",
        "client_id": user.client_id,
        "role": user.role,
        "email": user.email,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def current_portal_user(authorization: str | None = Header(default=None), db: Session = Depends(get_db)) -> ClientPortalUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Client portal authentication required")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("kind") != "client_portal":
            raise ValueError("Wrong token kind")
        user_id = int(payload["sub"])
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Invalid or expired client portal session") from exc
    user = db.get(ClientPortalUser, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Client portal user unavailable")
    return user


@router.get("/ops/client-portal-users")
def list_portal_users(db: Session = Depends(get_db), user: User = Depends(require_recovery("portal:read"))):
    rows = db.scalars(select(ClientPortalUser).order_by(ClientPortalUser.full_name)).all()
    result = []
    for row in rows:
        data = {k: v for k, v in _serialize(row).items() if k != "password_hash"}
        client = db.get(Client, row.client_id)
        data["client_name"] = client.name if client else None
        result.append(data)
    return result


@router.post("/ops/client-portal-users", status_code=201)
def create_portal_user(payload: PortalUserInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("portal:create"))):
    if not db.get(Client, payload.client_id):
        raise HTTPException(status_code=404, detail="Client not found")
    if db.scalar(select(ClientPortalUser).where(ClientPortalUser.email == payload.email.lower())):
        raise HTTPException(status_code=409, detail="Client portal email already exists")
    item = ClientPortalUser(
        client_id=payload.client_id,
        email=payload.email.lower(),
        full_name=payload.full_name,
        role=payload.role,
        password_hash=hash_password(payload.password),
        is_active=payload.is_active,
    )
    db.add(item); db.flush()
    audit(db, request, user, "client_portal_user.created", "client_portal_user", str(item.id), after={"client_id": item.client_id, "email": item.email, "role": item.role, "is_active": item.is_active})
    db.commit()
    return {k: v for k, v in _serialize(item).items() if k != "password_hash"}


@router.patch("/ops/client-portal-users/{portal_user_id}")
def update_portal_user(portal_user_id: int, payload: PortalUserPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_recovery("portal:update"))):
    item = db.get(ClientPortalUser, portal_user_id)
    if not item:
        raise HTTPException(status_code=404, detail="Client portal user not found")
    before = {k: v for k, v in _serialize(item).items() if k != "password_hash"}
    changes = payload.model_dump(exclude_unset=True)
    new_password = changes.pop("new_password", None)
    for key, value in changes.items():
        setattr(item, key, value)
    if new_password:
        item.password_hash = hash_password(new_password)
    after = {k: v for k, v in _serialize(item).items() if k != "password_hash"}
    audit(db, request, user, "client_portal_user.updated", "client_portal_user", str(item.id), before=before, after=after)
    db.commit(); return after


@router.post("/client-portal/auth/login")
def client_portal_login(payload: PortalLogin, request: Request, db: Session = Depends(get_db)):
    user = db.scalar(select(ClientPortalUser).where(ClientPortalUser.email == payload.email.lower()))
    if not user or not user.is_active or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user.last_login_at = datetime.now(timezone.utc)
    audit(db, request, None, "client_portal.login", "client_portal_user", str(user.id), after={"client_id": user.client_id, "email": user.email})
    db.commit()
    return {
        "access_token": _create_portal_token(user),
        "token_type": "bearer",
        "user": {"id": user.id, "client_id": user.client_id, "email": user.email, "full_name": user.full_name, "role": user.role},
    }


@router.get("/client-portal/me")
def client_portal_me(user: ClientPortalUser = Depends(current_portal_user), db: Session = Depends(get_db)):
    client = db.get(Client, user.client_id)
    return {"id": user.id, "client_id": user.client_id, "client_name": client.name if client else None, "email": user.email, "full_name": user.full_name, "role": user.role}


@router.get("/client-portal/dashboard")
def client_portal_dashboard(user: ClientPortalUser = Depends(current_portal_user), db: Session = Depends(get_db)):
    matter_ids = select(Matter.id).where(Matter.client_id == user.client_id)
    recovered = db.scalar(select(func.coalesce(func.sum(RecoveryPayment.amount), 0)).where(RecoveryPayment.matter_id.in_(matter_ids), RecoveryPayment.status == "matched")) or 0
    return {
        "open_matters": db.scalar(select(func.count()).select_from(Matter).where(Matter.client_id == user.client_id, Matter.status == "open")) or 0,
        "settlements": db.scalar(select(func.count()).select_from(Settlement).where(Settlement.matter_id.in_(matter_ids), Settlement.status.in_(["approved", "active"]))) or 0,
        "judgments": db.scalar(select(func.count()).select_from(Judgment).where(Judgment.matter_id.in_(matter_ids), Judgment.status.in_(["unsatisfied", "part_satisfied"]))) or 0,
        "execution_actions": db.scalar(select(func.count()).select_from(ExecutionAction).where(ExecutionAction.matter_id.in_(matter_ids), ExecutionAction.status.in_(["planned", "filed", "issued", "served", "in_progress"]))) or 0,
        "recovered_total": str(recovered),
    }


@router.get("/client-portal/matters")
def client_portal_matters(user: ClientPortalUser = Depends(current_portal_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Matter).where(Matter.client_id == user.client_id).order_by(Matter.updated_at.desc())).all()
    return [
        {
            "id": row.id,
            "matter_reference": row.matter_reference,
            "client_reference": row.client_reference,
            "title": row.title,
            "matter_type": row.matter_type,
            "status": row.status,
            "stage": row.stage,
            "priority": row.priority,
            "lead_professional": row.lead_professional,
            "court_name": row.court_name,
            "court_case_number": row.court_case_number,
            "next_deadline": row.next_deadline.isoformat() if row.next_deadline else None,
            "recovery_amount": str(row.recovery_amount),
            "updated_at": row.updated_at.isoformat() if row.updated_at else None,
        }
        for row in rows
    ]


@router.get("/client-portal/matters/{matter_id}")
def client_portal_matter(matter_id: int, user: ClientPortalUser = Depends(current_portal_user), db: Session = Depends(get_db)):
    matter = db.scalar(select(Matter).where(Matter.id == matter_id, Matter.client_id == user.client_id))
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    documents = db.scalars(select(MatterDocument).where(MatterDocument.matter_id == matter_id, MatterDocument.visibility == "client").order_by(MatterDocument.created_at.desc())).all()
    settlements = db.scalars(select(Settlement).where(Settlement.matter_id == matter_id).order_by(Settlement.created_at.desc())).all()
    judgments = db.scalars(select(Judgment).where(Judgment.matter_id == matter_id).order_by(Judgment.judgment_date.desc())).all()
    executions = db.scalars(select(ExecutionAction).where(ExecutionAction.matter_id == matter_id).order_by(ExecutionAction.updated_at.desc())).all()
    payments = db.scalars(select(RecoveryPayment).where(RecoveryPayment.matter_id == matter_id, RecoveryPayment.status == "matched").order_by(RecoveryPayment.received_at.desc())).all()
    return {
        "matter": {
            "id": matter.id,
            "matter_reference": matter.matter_reference,
            "client_reference": matter.client_reference,
            "title": matter.title,
            "matter_type": matter.matter_type,
            "status": matter.status,
            "stage": matter.stage,
            "lead_professional": matter.lead_professional,
            "court_name": matter.court_name,
            "court_case_number": matter.court_case_number,
            "next_deadline": matter.next_deadline.isoformat() if matter.next_deadline else None,
            "recovery_amount": str(matter.recovery_amount),
        },
        "documents": [_serialize(row) for row in documents],
        "settlements": [_serialize(row) for row in settlements],
        "judgments": [_serialize(row) for row in judgments],
        "executions": [_serialize(row) for row in executions],
        "payments": [_serialize(row) for row in payments],
    }


@router.get("/client-portal/documents/{document_id}/download")
def client_portal_download(document_id: int, user: ClientPortalUser = Depends(current_portal_user), db: Session = Depends(get_db)):
    item = db.scalar(
        select(MatterDocument)
        .join(Matter, Matter.id == MatterDocument.matter_id)
        .where(MatterDocument.id == document_id, MatterDocument.visibility == "client", Matter.client_id == user.client_id)
    )
    if not item:
        raise HTTPException(status_code=404, detail="Document not found")
    target = vault_path / item.stored_name
    if not target.exists():
        raise HTTPException(status_code=410, detail="Document file is unavailable")
    return FileResponse(path=target, media_type=item.content_type, filename=item.original_name)
