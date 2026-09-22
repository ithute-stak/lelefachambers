from __future__ import annotations

import hmac
import os
import secrets
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func, or_, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.main import (
    AuditLog,
    Base,
    ConsultationRequest,
    Credential,
    MediaAsset,
    Professional,
    TimestampMixin,
    User,
    audit,
    current_user,
    get_db,
    hash_password,
    model_dict,
)

router = APIRouter(prefix="/api/v1", tags=["legal-operations"])


class Client(TimestampMixin, Base):
    __tablename__ = "legal_clients"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    client_code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    client_type: Mapped[str] = mapped_column(String(40), default="institutional", index=True, nullable=False)
    registration_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    tax_number: Mapped[str | None] = mapped_column(String(120), nullable=True)
    contact_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(80), nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="active", index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class Matter(TimestampMixin, Base):
    __tablename__ = "legal_matters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_reference: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    client_id: Mapped[int] = mapped_column(ForeignKey("legal_clients.id"), index=True, nullable=False)
    client_reference: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    matter_type: Mapped[str] = mapped_column(String(80), default="litigation", index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True, nullable=False)
    stage: Mapped[str] = mapped_column(String(64), default="instruction", index=True, nullable=False)
    priority: Mapped[str] = mapped_column(String(24), default="normal", nullable=False)
    lead_professional: Mapped[str | None] = mapped_column(String(255), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    court_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    court_case_number: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
    next_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recovery_amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    legal_costs: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    confidential_notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class MatterParty(TimestampMixin, Base):
    __tablename__ = "matter_parties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    role: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    identifier: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
    contact_summary: Mapped[str | None] = mapped_column(Text, nullable=True)


class CourtEvent(TimestampMixin, Base):
    __tablename__ = "court_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    court_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    courtroom: Mapped[str | None] = mapped_column(String(120), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="scheduled", index=True, nullable=False)
    outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_step: Mapped[str | None] = mapped_column(Text, nullable=True)


class LegalTask(TimestampMixin, Base):
    __tablename__ = "legal_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    assigned_to: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True, nullable=True)
    priority: Mapped[str] = mapped_column(String(24), default="normal", index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="open", index=True, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConflictCheck(TimestampMixin, Base):
    __tablename__ = "conflict_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    identifier: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
    related_names: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    requested_for: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending", index=True, nullable=False)
    hits: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    reviewer: Mapped[str | None] = mapped_column(String(255), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    requested_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class RecoveryReferral(TimestampMixin, Base):
    __tablename__ = "recovery_referrals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_system: Mapped[str] = mapped_column(String(80), default="lelefa-debt-collectors", index=True, nullable=False)
    external_reference: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    creditor_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    debtor_reference: Mapped[str] = mapped_column(String(160), index=True, nullable=False)
    debtor_name: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    outstanding_balance: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="LSL", nullable=False)
    collection_stage: Mapped[str | None] = mapped_column(String(80), nullable=True)
    collection_history: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    document_manifest: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    legal_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    authority_reference: Mapped[str | None] = mapped_column(String(160), nullable=True)
    conflict_status: Mapped[str] = mapped_column(String(40), default="pending", index=True, nullable=False)
    conflict_hits: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="pending_review", index=True, nullable=False)
    matter_id: Mapped[int | None] = mapped_column(ForeignKey("legal_matters.id"), nullable=True)
    reviewed_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str | None] = mapped_column(Text, nullable=True)


OPS_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "system_owner": {"*"},
    "chambers_admin": {
        "ops:read", "client:*", "matter:*", "party:*", "court:*", "task:*", "conflict:*",
        "referral:*", "credential:*", "user:read", "media:read"
    },
    "managing_advocate": {
        "ops:read", "client:*", "matter:*", "party:*", "court:*", "task:*", "conflict:*",
        "referral:*", "credential:*", "user:read", "media:read"
    },
    "advocate": {
        "ops:read", "client:read", "matter:read", "matter:update", "party:*", "court:*", "task:*",
        "conflict:create", "conflict:read", "referral:read", "credential:read", "media:read"
    },
    "reception": {"ops:read", "client:read", "matter:read", "conflict:create", "conflict:read"},
    "auditor": {"ops:read", "client:read", "matter:read", "party:read", "court:read", "task:read", "conflict:read", "referral:read", "credential:read", "media:read"},
}


def ops_allows(role: str, permission: str) -> bool:
    allowed = OPS_ROLE_PERMISSIONS.get(role, set())
    if "*" in allowed or permission in allowed:
        return True
    return permission.split(":", 1)[0] + ":*" in allowed


def require_ops(permission: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if not ops_allows(user.role, permission):
            raise HTTPException(status_code=403, detail="Insufficient legal-operations permission")
        return user
    return dependency


class ClientInput(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    client_type: Literal["institutional", "corporate", "individual", "government", "sacco", "mfi", "bank"] = "institutional"
    registration_number: str | None = None
    tax_number: str | None = None
    contact_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    status: Literal["active", "inactive", "prospective"] = "active"
    notes: str | None = None


class ClientPatch(BaseModel):
    name: str | None = None
    client_type: str | None = None
    registration_number: str | None = None
    tax_number: str | None = None
    contact_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    address: str | None = None
    status: str | None = None
    notes: str | None = None


class MatterInput(BaseModel):
    client_id: int
    client_reference: str | None = None
    title: str = Field(min_length=3, max_length=255)
    matter_type: Literal["debt_recovery", "commercial_litigation", "civil_litigation", "corporate", "compliance", "mediation", "employment", "other"] = "commercial_litigation"
    status: Literal["open", "on_hold", "closed"] = "open"
    stage: str = "instruction"
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    lead_professional: str | None = None
    description: str | None = None
    court_name: str | None = None
    court_case_number: str | None = None
    next_deadline: datetime | None = None
    confidential_notes: str | None = None


class MatterPatch(BaseModel):
    client_reference: str | None = None
    title: str | None = None
    matter_type: str | None = None
    status: str | None = None
    stage: str | None = None
    priority: str | None = None
    lead_professional: str | None = None
    description: str | None = None
    court_name: str | None = None
    court_case_number: str | None = None
    next_deadline: datetime | None = None
    recovery_amount: Decimal | None = None
    legal_costs: Decimal | None = None
    confidential_notes: str | None = None


class PartyInput(BaseModel):
    name: str = Field(min_length=2, max_length=255)
    role: str = Field(min_length=2, max_length=64)
    identifier: str | None = None
    contact_summary: str | None = None


class CourtEventInput(BaseModel):
    event_type: str
    scheduled_at: datetime
    court_name: str | None = None
    courtroom: str | None = None
    status: Literal["scheduled", "completed", "postponed", "cancelled"] = "scheduled"
    outcome: str | None = None
    next_step: str | None = None


class CourtEventPatch(BaseModel):
    event_type: str | None = None
    scheduled_at: datetime | None = None
    court_name: str | None = None
    courtroom: str | None = None
    status: str | None = None
    outcome: str | None = None
    next_step: str | None = None


class TaskInput(BaseModel):
    title: str
    description: str | None = None
    assigned_to: str | None = None
    due_at: datetime | None = None
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    status: Literal["open", "in_progress", "blocked", "completed", "cancelled"] = "open"


class TaskPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    assigned_to: str | None = None
    due_at: datetime | None = None
    priority: str | None = None
    status: str | None = None


class ConflictInput(BaseModel):
    subject_name: str = Field(min_length=2, max_length=255)
    identifier: str | None = None
    related_names: list[str] = Field(default_factory=list)
    requested_for: str | None = None


class ConflictReview(BaseModel):
    status: Literal["clear", "cleared_after_review", "conflict_confirmed"]
    review_note: str = Field(min_length=3, max_length=4000)


class ReferralInput(BaseModel):
    source_system: str = "lelefa-debt-collectors"
    external_reference: str
    creditor_name: str
    debtor_reference: str
    debtor_name: str
    outstanding_balance: Decimal = Field(gt=0)
    currency: str = "LSL"
    collection_stage: str | None = None
    collection_history: list[dict[str, Any]] = Field(default_factory=list)
    document_manifest: list[dict[str, Any]] = Field(default_factory=list)
    legal_reason: str | None = None
    authority_reference: str | None = None


class ReferralDecision(BaseModel):
    review_note: str | None = None


class ReferralConflictDecision(BaseModel):
    conflict_status: Literal["clear", "cleared_after_review", "conflict_confirmed"]
    review_note: str


class CredentialInput(BaseModel):
    professional_id: int
    credential_type: str
    issuer: str | None = None
    reference_number: str | None = None
    issue_date: str | None = None
    expiry_date: str | None = None
    document_url: str | None = None
    is_public: bool = False
    verified: bool = False


class UserInput(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=255)
    role: Literal["system_owner", "chambers_admin", "managing_advocate", "advocate", "content_editor", "reception", "auditor"]
    password: str = Field(min_length=12, max_length=256)
    is_active: bool = True


class UserPatch(BaseModel):
    full_name: str | None = None
    role: str | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=12, max_length=256)


def _client_code(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.scalar(select(func.count()).select_from(Client)) or 0
    while True:
        code = f"LC-C{year}-{count + 1:05d}"
        if not db.scalar(select(Client).where(Client.client_code == code)):
            return code
        count += 1


def _matter_reference(db: Session) -> str:
    year = datetime.now(timezone.utc).year
    count = db.scalar(select(func.count()).select_from(Matter)) or 0
    while True:
        reference = f"LC-{year}-{count + 1:06d}"
        if not db.scalar(select(Matter).where(Matter.matter_reference == reference)):
            return reference
        count += 1


def _serialize(obj: Any) -> dict[str, Any]:
    data = model_dict(obj)
    for key, value in list(data.items()):
        if isinstance(value, Decimal):
            data[key] = str(value)
    return data


def _conflict_hits(db: Session, names: list[str], identifier: str | None = None) -> list[dict[str, Any]]:
    hits: list[dict[str, Any]] = []
    seen: set[tuple[str, int]] = set()
    clean_names = [name.strip() for name in names if name and name.strip()]

    for name in clean_names:
        pattern = f"%{name.lower()}%"
        for client in db.scalars(select(Client).where(func.lower(Client.name).like(pattern)).limit(20)).all():
            key = ("client", client.id)
            if key not in seen:
                seen.add(key)
                hits.append({"source": "client", "id": client.id, "name": client.name, "role": "client", "reference": client.client_code})
        for party in db.scalars(select(MatterParty).where(func.lower(MatterParty.name).like(pattern)).limit(30)).all():
            key = ("matter_party", party.id)
            if key not in seen:
                seen.add(key)
                matter = db.get(Matter, party.matter_id)
                hits.append({"source": "matter_party", "id": party.id, "name": party.name, "role": party.role, "reference": matter.matter_reference if matter else None})
        for consultation in db.scalars(select(ConsultationRequest).where(func.lower(ConsultationRequest.full_name).like(pattern)).limit(20)).all():
            key = ("consultation", consultation.id)
            if key not in seen:
                seen.add(key)
                hits.append({"source": "consultation", "id": consultation.id, "name": consultation.full_name, "role": "prospective_client", "reference": f"CONS-{consultation.id}"})

    if identifier:
        for party in db.scalars(select(MatterParty).where(MatterParty.identifier == identifier).limit(20)).all():
            key = ("matter_party", party.id)
            if key not in seen:
                seen.add(key)
                matter = db.get(Matter, party.matter_id)
                hits.append({"source": "matter_party", "id": party.id, "name": party.name, "role": party.role, "reference": matter.matter_reference if matter else None, "identifier_match": True})
    return hits


@router.get("/ops/dashboard")
def operations_dashboard(db: Session = Depends(get_db), user: User = Depends(require_ops("ops:read"))):
    now = datetime.now(timezone.utc)
    upcoming = db.scalars(select(CourtEvent).where(CourtEvent.scheduled_at >= now, CourtEvent.status == "scheduled").order_by(CourtEvent.scheduled_at).limit(8)).all()
    overdue_tasks = db.scalars(select(LegalTask).where(LegalTask.due_at < now, LegalTask.status.in_(["open", "in_progress", "blocked"])).order_by(LegalTask.due_at).limit(8)).all()
    open_matters = db.scalar(select(func.count()).select_from(Matter).where(Matter.status == "open")) or 0
    return {
        "open_matters": open_matters,
        "active_clients": db.scalar(select(func.count()).select_from(Client).where(Client.status == "active")) or 0,
        "upcoming_court_events": db.scalar(select(func.count()).select_from(CourtEvent).where(CourtEvent.scheduled_at >= now, CourtEvent.status == "scheduled")) or 0,
        "overdue_tasks": db.scalar(select(func.count()).select_from(LegalTask).where(LegalTask.due_at < now, LegalTask.status.in_(["open", "in_progress", "blocked"]))) or 0,
        "pending_conflicts": db.scalar(select(func.count()).select_from(ConflictCheck).where(ConflictCheck.status == "potential_conflict")) or 0,
        "pending_referrals": db.scalar(select(func.count()).select_from(RecoveryReferral).where(RecoveryReferral.status == "pending_review")) or 0,
        "recovery_total": str(db.scalar(select(func.coalesce(func.sum(Matter.recovery_amount), 0))) or 0),
        "upcoming": [_serialize(item) for item in upcoming],
        "overdue": [_serialize(item) for item in overdue_tasks],
        "user": {"id": user.id, "full_name": user.full_name, "role": user.role},
    }


@router.get("/ops/clients")
def list_clients(db: Session = Depends(get_db), user: User = Depends(require_ops("client:read"))):
    return [_serialize(row) for row in db.scalars(select(Client).order_by(Client.name)).all()]


@router.post("/ops/clients", status_code=201)
def create_client(payload: ClientInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("client:create"))):
    item = Client(client_code=_client_code(db), **payload.model_dump())
    db.add(item); db.flush()
    audit(db, request, user, "legal_client.created", "legal_client", str(item.id), after=_serialize(item))
    db.commit()
    return _serialize(item)


@router.patch("/ops/clients/{client_id}")
def update_client(client_id: int, payload: ClientPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("client:update"))):
    item = db.get(Client, client_id)
    if not item: raise HTTPException(status_code=404, detail="Client not found")
    before = _serialize(item)
    for key, value in payload.model_dump(exclude_unset=True).items(): setattr(item, key, value)
    audit(db, request, user, "legal_client.updated", "legal_client", str(item.id), before=before, after=_serialize(item))
    db.commit(); return _serialize(item)


@router.get("/ops/matters")
def list_matters(client_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_ops("matter:read"))):
    stmt = select(Matter).order_by(Matter.updated_at.desc())
    if client_id: stmt = stmt.where(Matter.client_id == client_id)
    rows = db.scalars(stmt).all()
    result = []
    for row in rows:
        data = _serialize(row)
        client = db.get(Client, row.client_id)
        data["client_name"] = client.name if client else None
        data["party_count"] = db.scalar(select(func.count()).select_from(MatterParty).where(MatterParty.matter_id == row.id)) or 0
        result.append(data)
    return result


@router.post("/ops/matters", status_code=201)
def create_matter(payload: MatterInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("matter:create"))):
    if not db.get(Client, payload.client_id): raise HTTPException(status_code=404, detail="Client not found")
    item = Matter(matter_reference=_matter_reference(db), **payload.model_dump())
    db.add(item); db.flush()
    audit(db, request, user, "matter.created", "legal_matter", str(item.id), after=_serialize(item))
    db.commit(); return _serialize(item)


@router.get("/ops/matters/{matter_id}")
def get_matter(matter_id: int, db: Session = Depends(get_db), user: User = Depends(require_ops("matter:read"))):
    item = db.get(Matter, matter_id)
    if not item: raise HTTPException(status_code=404, detail="Matter not found")
    data = _serialize(item)
    client = db.get(Client, item.client_id)
    data["client"] = _serialize(client) if client else None
    data["parties"] = [_serialize(row) for row in db.scalars(select(MatterParty).where(MatterParty.matter_id == matter_id).order_by(MatterParty.role, MatterParty.name)).all()]
    data["court_events"] = [_serialize(row) for row in db.scalars(select(CourtEvent).where(CourtEvent.matter_id == matter_id).order_by(CourtEvent.scheduled_at)).all()]
    data["tasks"] = [_serialize(row) for row in db.scalars(select(LegalTask).where(LegalTask.matter_id == matter_id).order_by(LegalTask.due_at)).all()]
    return data


@router.patch("/ops/matters/{matter_id}")
def update_matter(matter_id: int, payload: MatterPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("matter:update"))):
    item = db.get(Matter, matter_id)
    if not item: raise HTTPException(status_code=404, detail="Matter not found")
    before = _serialize(item)
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items(): setattr(item, key, value)
    if changes.get("status") == "closed" and not item.closed_at: item.closed_at = datetime.now(timezone.utc)
    if changes.get("status") and changes.get("status") != "closed": item.closed_at = None
    audit(db, request, user, "matter.updated", "legal_matter", str(item.id), before=before, after=_serialize(item))
    db.commit(); return _serialize(item)


@router.post("/ops/matters/{matter_id}/parties", status_code=201)
def add_party(matter_id: int, payload: PartyInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("party:create"))):
    if not db.get(Matter, matter_id): raise HTTPException(status_code=404, detail="Matter not found")
    item = MatterParty(matter_id=matter_id, **payload.model_dump())
    db.add(item); db.flush()
    audit(db, request, user, "matter_party.created", "matter_party", str(item.id), after=_serialize(item))
    db.commit(); return _serialize(item)


@router.get("/ops/court-events")
def list_court_events(db: Session = Depends(get_db), user: User = Depends(require_ops("court:read"))):
    rows = db.scalars(select(CourtEvent).order_by(CourtEvent.scheduled_at)).all()
    result = []
    for row in rows:
        data = _serialize(row); matter = db.get(Matter, row.matter_id)
        data["matter_reference"] = matter.matter_reference if matter else None; data["matter_title"] = matter.title if matter else None
        result.append(data)
    return result


@router.post("/ops/matters/{matter_id}/court-events", status_code=201)
def create_court_event(matter_id: int, payload: CourtEventInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("court:create"))):
    matter = db.get(Matter, matter_id)
    if not matter: raise HTTPException(status_code=404, detail="Matter not found")
    item = CourtEvent(matter_id=matter_id, **payload.model_dump())
    db.add(item); db.flush()
    if payload.status == "scheduled" and (matter.next_deadline is None or payload.scheduled_at < matter.next_deadline): matter.next_deadline = payload.scheduled_at
    audit(db, request, user, "court_event.created", "court_event", str(item.id), after=_serialize(item))
    db.commit(); return _serialize(item)


@router.patch("/ops/court-events/{event_id}")
def update_court_event(event_id: int, payload: CourtEventPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("court:update"))):
    item = db.get(CourtEvent, event_id)
    if not item: raise HTTPException(status_code=404, detail="Court event not found")
    before = _serialize(item)
    for key, value in payload.model_dump(exclude_unset=True).items(): setattr(item, key, value)
    audit(db, request, user, "court_event.updated", "court_event", str(item.id), before=before, after=_serialize(item))
    db.commit(); return _serialize(item)


@router.get("/ops/tasks")
def list_tasks(db: Session = Depends(get_db), user: User = Depends(require_ops("task:read"))):
    rows = db.scalars(select(LegalTask).order_by(LegalTask.status, LegalTask.due_at)).all()
    result = []
    for row in rows:
        data = _serialize(row); matter = db.get(Matter, row.matter_id)
        data["matter_reference"] = matter.matter_reference if matter else None; data["matter_title"] = matter.title if matter else None
        result.append(data)
    return result


@router.post("/ops/matters/{matter_id}/tasks", status_code=201)
def create_task(matter_id: int, payload: TaskInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("task:create"))):
    if not db.get(Matter, matter_id): raise HTTPException(status_code=404, detail="Matter not found")
    item = LegalTask(matter_id=matter_id, **payload.model_dump())
    db.add(item); db.flush(); audit(db, request, user, "legal_task.created", "legal_task", str(item.id), after=_serialize(item)); db.commit(); return _serialize(item)


@router.patch("/ops/tasks/{task_id}")
def update_task(task_id: int, payload: TaskPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("task:update"))):
    item = db.get(LegalTask, task_id)
    if not item: raise HTTPException(status_code=404, detail="Task not found")
    before = _serialize(item); changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items(): setattr(item, key, value)
    if changes.get("status") == "completed" and not item.completed_at: item.completed_at = datetime.now(timezone.utc)
    elif changes.get("status") and changes.get("status") != "completed": item.completed_at = None
    audit(db, request, user, "legal_task.updated", "legal_task", str(item.id), before=before, after=_serialize(item)); db.commit(); return _serialize(item)


@router.get("/ops/conflict-checks")
def list_conflicts(db: Session = Depends(get_db), user: User = Depends(require_ops("conflict:read"))):
    return [_serialize(row) for row in db.scalars(select(ConflictCheck).order_by(ConflictCheck.created_at.desc())).all()]


@router.post("/ops/conflict-checks", status_code=201)
def create_conflict(payload: ConflictInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("conflict:create"))):
    hits = _conflict_hits(db, [payload.subject_name, *payload.related_names], payload.identifier)
    item = ConflictCheck(**payload.model_dump(), hits=hits, status="potential_conflict" if hits else "clear", requested_by_id=user.id)
    db.add(item); db.flush(); audit(db, request, user, "conflict_check.created", "conflict_check", str(item.id), after=_serialize(item)); db.commit(); return _serialize(item)


@router.post("/ops/conflict-checks/{check_id}/review")
def review_conflict(check_id: int, payload: ConflictReview, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("conflict:review"))):
    item = db.get(ConflictCheck, check_id)
    if not item: raise HTTPException(status_code=404, detail="Conflict check not found")
    before = _serialize(item); item.status = payload.status; item.review_note = payload.review_note; item.reviewer = user.full_name; item.reviewed_at = datetime.now(timezone.utc)
    audit(db, request, user, "conflict_check.reviewed", "conflict_check", str(item.id), before=before, after=_serialize(item)); db.commit(); return _serialize(item)


def _verify_integration_key(value: str | None):
    expected = os.environ.get("LELEFA_DEBT_COLLECTORS_API_KEY", "").strip()
    if not expected or expected.startswith("CHANGE_THIS_"):
        raise HTTPException(status_code=503, detail="Lelefa Debt Collectors integration is not enabled")
    if not value or not hmac.compare_digest(value, expected):
        raise HTTPException(status_code=401, detail="Invalid integration credential")


@router.post("/integrations/lelefa-debt-collectors/referrals", status_code=201)
def receive_recovery_referral(payload: ReferralInput, request: Request, x_integration_key: str | None = Header(default=None), db: Session = Depends(get_db)):
    _verify_integration_key(x_integration_key)
    duplicate = db.scalar(select(RecoveryReferral).where(RecoveryReferral.source_system == payload.source_system, RecoveryReferral.external_reference == payload.external_reference))
    if duplicate: return {"id": duplicate.id, "status": duplicate.status, "duplicate": True}
    hits = _conflict_hits(db, [payload.debtor_name, payload.creditor_name], payload.debtor_reference)
    item = RecoveryReferral(**payload.model_dump(), conflict_status="potential_conflict" if hits else "clear", conflict_hits=hits)
    db.add(item); db.flush(); audit(db, request, None, "recovery_referral.received", "recovery_referral", str(item.id), after={"source_system": item.source_system, "external_reference": item.external_reference, "status": item.status, "conflict_status": item.conflict_status}); db.commit()
    return {"id": item.id, "status": item.status, "conflict_status": item.conflict_status, "duplicate": False}


@router.get("/ops/recovery-referrals")
def list_referrals(db: Session = Depends(get_db), user: User = Depends(require_ops("referral:read"))):
    return [_serialize(row) for row in db.scalars(select(RecoveryReferral).order_by(RecoveryReferral.created_at.desc())).all()]


@router.post("/ops/recovery-referrals/{referral_id}/conflict-decision")
def referral_conflict_decision(referral_id: int, payload: ReferralConflictDecision, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("referral:review"))):
    item = db.get(RecoveryReferral, referral_id)
    if not item: raise HTTPException(status_code=404, detail="Referral not found")
    before = _serialize(item); item.conflict_status = payload.conflict_status; item.review_note = payload.review_note; item.reviewed_by_id = user.id; item.reviewed_at = datetime.now(timezone.utc)
    audit(db, request, user, "recovery_referral.conflict_reviewed", "recovery_referral", str(item.id), before=before, after=_serialize(item)); db.commit(); return _serialize(item)


@router.post("/ops/recovery-referrals/{referral_id}/accept")
def accept_referral(referral_id: int, payload: ReferralDecision, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("referral:accept"))):
    item = db.get(RecoveryReferral, referral_id)
    if not item: raise HTTPException(status_code=404, detail="Referral not found")
    if item.status == "accepted" and item.matter_id:
        return {"referral": _serialize(item), "matter": _serialize(db.get(Matter, item.matter_id))}
    if item.conflict_status not in {"clear", "cleared_after_review"}:
        raise HTTPException(status_code=409, detail="Referral cannot be accepted until conflict status is clear")
    client = db.scalar(select(Client).where(func.lower(Client.name) == item.creditor_name.lower()))
    if not client:
        client = Client(client_code=_client_code(db), name=item.creditor_name, client_type="institutional", status="active", notes="Created from an authorised Lelefa Debt Collectors legal referral.")
        db.add(client); db.flush()
    matter = Matter(
        matter_reference=_matter_reference(db), client_id=client.id, client_reference=item.external_reference,
        title=f"Debt recovery: {item.creditor_name} / {item.debtor_reference}", matter_type="debt_recovery",
        stage="legal_review", priority="high", description=item.legal_reason,
        confidential_notes=f"Referral source: {item.source_system}. Authority: {item.authority_reference or 'not supplied'}.",
    )
    db.add(matter); db.flush()
    db.add(MatterParty(matter_id=matter.id, name=item.debtor_name, role="debtor/respondent", identifier=item.debtor_reference))
    before = _serialize(item); item.status = "accepted"; item.matter_id = matter.id; item.reviewed_by_id = user.id; item.reviewed_at = datetime.now(timezone.utc); item.review_note = payload.review_note
    audit(db, request, user, "recovery_referral.accepted", "recovery_referral", str(item.id), before=before, after=_serialize(item)); audit(db, request, user, "matter.created_from_referral", "legal_matter", str(matter.id), after=_serialize(matter)); db.commit()
    return {"referral": _serialize(item), "matter": _serialize(matter)}


@router.post("/ops/recovery-referrals/{referral_id}/decline")
def decline_referral(referral_id: int, payload: ReferralDecision, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("referral:review"))):
    item = db.get(RecoveryReferral, referral_id)
    if not item: raise HTTPException(status_code=404, detail="Referral not found")
    before = _serialize(item); item.status = "declined"; item.reviewed_by_id = user.id; item.reviewed_at = datetime.now(timezone.utc); item.review_note = payload.review_note
    audit(db, request, user, "recovery_referral.declined", "recovery_referral", str(item.id), before=before, after=_serialize(item)); db.commit(); return _serialize(item)


@router.get("/ops/credentials")
def list_credentials(db: Session = Depends(get_db), user: User = Depends(require_ops("credential:read"))):
    rows = db.scalars(select(Credential).order_by(Credential.expiry_date, Credential.credential_type)).all()
    result = []
    for row in rows:
        data = _serialize(row); professional = db.get(Professional, row.professional_id); data["professional_name"] = professional.full_name if professional else None; result.append(data)
    return result


@router.post("/ops/credentials", status_code=201)
def create_credential(payload: CredentialInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("credential:create"))):
    if not db.get(Professional, payload.professional_id): raise HTTPException(status_code=404, detail="Professional not found")
    data = payload.model_dump(); verified = data.pop("verified")
    item = Credential(**data, verified_at=datetime.now(timezone.utc) if verified else None)
    db.add(item); db.flush(); audit(db, request, user, "credential.created", "credential", str(item.id), after=_serialize(item)); db.commit(); return _serialize(item)


@router.delete("/ops/credentials/{credential_id}", status_code=204)
def delete_credential(credential_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("credential:delete"))):
    item = db.get(Credential, credential_id)
    if not item: raise HTTPException(status_code=404, detail="Credential not found")
    before = _serialize(item); db.delete(item); audit(db, request, user, "credential.deleted", "credential", str(credential_id), before=before); db.commit(); return None


@router.get("/ops/users")
def list_users(db: Session = Depends(get_db), user: User = Depends(require_ops("user:read"))):
    rows = db.scalars(select(User).order_by(User.full_name)).all()
    return [{k: v for k, v in model_dict(row).items() if k != "password_hash"} for row in rows]


@router.post("/ops/users", status_code=201)
def create_user(payload: UserInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("user:create"))):
    if user.role != "system_owner": raise HTTPException(status_code=403, detail="Only the System Owner can create Chambers users")
    if db.scalar(select(User).where(User.email == payload.email.lower())): raise HTTPException(status_code=409, detail="Email already exists")
    item = User(email=payload.email.lower(), full_name=payload.full_name, role=payload.role, password_hash=hash_password(payload.password), is_active=payload.is_active)
    db.add(item); db.flush(); audit(db, request, user, "user.created", "user", str(item.id), after={"email": item.email, "full_name": item.full_name, "role": item.role, "is_active": item.is_active}); db.commit()
    return {k: v for k, v in model_dict(item).items() if k != "password_hash"}


@router.patch("/ops/users/{user_id}")
def update_user(user_id: int, payload: UserPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_ops("user:update"))):
    if user.role != "system_owner": raise HTTPException(status_code=403, detail="Only the System Owner can manage Chambers users")
    item = db.get(User, user_id)
    if not item: raise HTTPException(status_code=404, detail="User not found")
    before = {k: v for k, v in model_dict(item).items() if k != "password_hash"}; changes = payload.model_dump(exclude_unset=True); new_password = changes.pop("new_password", None)
    if item.id == user.id and changes.get("is_active") is False: raise HTTPException(status_code=409, detail="You cannot deactivate your own active session account")
    for key, value in changes.items(): setattr(item, key, value)
    if new_password: item.password_hash = hash_password(new_password)
    after = {k: v for k, v in model_dict(item).items() if k != "password_hash"}; audit(db, request, user, "user.updated", "user", str(item.id), before=before, after=after); db.commit(); return after


@router.get("/ops/media")
def list_media(db: Session = Depends(get_db), user: User = Depends(require_ops("media:read"))):
    return [_serialize(row) for row in db.scalars(select(MediaAsset).order_by(MediaAsset.created_at.desc())).all()]
