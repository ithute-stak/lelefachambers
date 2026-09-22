from __future__ import annotations

import calendar
import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Literal

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import JSON, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from app.main import Base, Credential, TimestampMixin, User, audit, current_user, get_db, model_dict
from app.operations import CourtEvent, LegalTask, Matter
from app.recovery import (
    RecoveryPayment,
    Settlement,
    _reconcile_matter,
    recovery_allows,
)

router = APIRouter(prefix="/api/v1", tags=["recovery-automation"])


class SettlementInstallment(TimestampMixin, Base):
    __tablename__ = "settlement_installments"
    __table_args__ = (UniqueConstraint("settlement_id", "sequence_no", name="uq_settlement_installment_sequence"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    settlement_id: Mapped[int] = mapped_column(ForeignKey("matter_settlements.id"), index=True, nullable=False)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    grace_until: Mapped[date | None] = mapped_column(Date, index=True, nullable=True)
    amount_due: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    amount_paid: Mapped[Decimal] = mapped_column(Numeric(18, 2), default=Decimal("0.00"), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="scheduled", index=True, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class PaymentAllocation(TimestampMixin, Base):
    __tablename__ = "payment_allocations"
    __table_args__ = (UniqueConstraint("payment_id", "installment_id", name="uq_payment_installment_allocation"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    payment_id: Mapped[int] = mapped_column(ForeignKey("recovery_payments.id"), index=True, nullable=False)
    installment_id: Mapped[int] = mapped_column(ForeignKey("settlement_installments.id"), index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    allocated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    allocation_source: Mapped[str] = mapped_column(String(40), default="automatic", nullable=False)


class ReminderEvent(TimestampMixin, Base):
    __tablename__ = "reminder_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    fingerprint: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    reminder_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), index=True, nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    matter_id: Mapped[int | None] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    severity: Mapped[str] = mapped_column(String(24), default="normal", index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True, nullable=False)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class IthutePayRequest(TimestampMixin, Base):
    __tablename__ = "ithute_pay_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    matter_id: Mapped[int] = mapped_column(ForeignKey("legal_matters.id"), index=True, nullable=False)
    settlement_id: Mapped[int | None] = mapped_column(ForeignKey("matter_settlements.id"), index=True, nullable=True)
    installment_id: Mapped[int | None] = mapped_column(ForeignKey("settlement_installments.id"), index=True, nullable=True)
    public_id: Mapped[str | None] = mapped_column(String(120), unique=True, index=True, nullable=True)
    idempotency_key: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(18, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(8), default="LSL", nullable=False)
    customer_phone: Mapped[str] = mapped_column(String(40), nullable=False)
    customer_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    provider: Mapped[str] = mapped_column(String(40), default="mpesa", nullable=False)
    payment_method: Mapped[str] = mapped_column(String(40), default="mobile_money", nullable=False)
    reference: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(40), default="pending_create", index=True, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_last_response: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)


class IthutePayWebhookEvent(Base):
    __tablename__ = "ithute_pay_webhook_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    event_id: Mapped[str] = mapped_column(String(160), unique=True, index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(120), index=True, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    processed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    processing_note: Mapped[str | None] = mapped_column(Text, nullable=True)


AUTOMATION_ROLE_PERMISSIONS: dict[str, set[str]] = {
    "system_owner": {"*"},
    "chambers_admin": {"automation:*", "reminder:*", "schedule:*", "allocation:*", "ithute_pay:*"},
    "managing_advocate": {"automation:*", "reminder:*", "schedule:*", "allocation:*", "ithute_pay:*"},
    "advocate": {"automation:read", "reminder:read", "reminder:update", "schedule:*", "allocation:*", "ithute_pay:read", "ithute_pay:create", "ithute_pay:refresh"},
    "auditor": {"automation:read", "reminder:read", "schedule:read", "allocation:read", "ithute_pay:read"},
}


def automation_allows(role: str, permission: str) -> bool:
    allowed = AUTOMATION_ROLE_PERMISSIONS.get(role, set())
    if "*" in allowed or permission in allowed:
        return True
    return permission.split(":", 1)[0] + ":*" in allowed


def require_automation(permission: str):
    def dependency(user: User = Depends(current_user)) -> User:
        if not automation_allows(user.role, permission):
            raise HTTPException(status_code=403, detail="Insufficient recovery-automation permission")
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


def _month_add(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def _schedule_date(first_due: date, frequency: str, index: int) -> date:
    if frequency == "weekly":
        return first_due + timedelta(days=7 * index)
    if frequency == "fortnightly":
        return first_due + timedelta(days=14 * index)
    if frequency == "monthly":
        return _month_add(first_due, index)
    if frequency == "once":
        return first_due
    return first_due + timedelta(days=30 * index)


def _recalculate_installment(db: Session, installment: SettlementInstallment) -> None:
    paid = db.scalar(
        select(func.coalesce(func.sum(PaymentAllocation.amount), 0)).where(PaymentAllocation.installment_id == installment.id)
    ) or Decimal("0.00")
    installment.amount_paid = Decimal(paid)
    if installment.amount_paid >= installment.amount_due:
        installment.status = "paid"
    elif installment.amount_paid > 0:
        installment.status = "partial"
    elif installment.grace_until and installment.grace_until < date.today():
        installment.status = "overdue"
    elif installment.due_date < date.today():
        installment.status = "due"
    else:
        installment.status = "scheduled"


def auto_allocate_payment(db: Session, payment: RecoveryPayment, allocated_by_id: int | None = None) -> list[PaymentAllocation]:
    if payment.status != "matched" or not payment.settlement_id:
        return []
    already = db.scalar(
        select(func.coalesce(func.sum(PaymentAllocation.amount), 0)).where(PaymentAllocation.payment_id == payment.id)
    ) or Decimal("0.00")
    remaining = max(Decimal(payment.amount) - Decimal(already), Decimal("0.00"))
    if remaining <= 0:
        return []
    installments = db.scalars(
        select(SettlementInstallment)
        .where(SettlementInstallment.settlement_id == payment.settlement_id, SettlementInstallment.status != "waived")
        .order_by(SettlementInstallment.due_date, SettlementInstallment.sequence_no)
    ).all()
    created: list[PaymentAllocation] = []
    for installment in installments:
        _recalculate_installment(db, installment)
        balance = max(Decimal(installment.amount_due) - Decimal(installment.amount_paid), Decimal("0.00"))
        if balance <= 0:
            continue
        amount = min(remaining, balance)
        if amount <= 0:
            break
        allocation = PaymentAllocation(
            payment_id=payment.id,
            installment_id=installment.id,
            amount=amount,
            allocated_by_id=allocated_by_id,
            allocation_source="automatic",
        )
        db.add(allocation); db.flush()
        created.append(allocation)
        remaining -= amount
        _recalculate_installment(db, installment)
        if remaining <= 0:
            break
    settlement = db.get(Settlement, payment.settlement_id)
    if settlement:
        all_installments = db.scalars(select(SettlementInstallment).where(SettlementInstallment.settlement_id == settlement.id)).all()
        for item in all_installments:
            _recalculate_installment(db, item)
        if all_installments and all(item.status == "paid" for item in all_installments):
            settlement.status = "completed"
        elif any(item.status == "overdue" for item in all_installments):
            settlement.status = "defaulted"
        elif any(item.amount_paid > 0 for item in all_installments):
            settlement.status = "active"
    return created


def _create_reminder(
    db: Session,
    reminder_type: str,
    entity_type: str,
    entity_id: int,
    due_at: datetime,
    title: str,
    message: str,
    matter_id: int | None = None,
    severity: str = "normal",
) -> ReminderEvent | None:
    fingerprint = f"{reminder_type}:{entity_type}:{entity_id}:{due_at.date().isoformat()}"
    if db.scalar(select(ReminderEvent).where(ReminderEvent.fingerprint == fingerprint)):
        return None
    item = ReminderEvent(
        fingerprint=fingerprint,
        reminder_type=reminder_type,
        entity_type=entity_type,
        entity_id=entity_id,
        matter_id=matter_id,
        due_at=due_at,
        title=title,
        message=message,
        severity=severity,
    )
    db.add(item)
    return item


def scan_reminders(db: Session) -> dict[str, int]:
    now = datetime.now(timezone.utc)
    created = {"court": 0, "task": 0, "installment": 0, "credential": 0}

    court_rows = db.scalars(
        select(CourtEvent).where(
            CourtEvent.status.in_(["scheduled", "postponed"]),
            CourtEvent.scheduled_at <= now + timedelta(days=7),
            CourtEvent.scheduled_at >= now - timedelta(days=1),
        )
    ).all()
    for row in court_rows:
        severity = "urgent" if row.scheduled_at <= now + timedelta(days=1) else "high"
        if _create_reminder(db, "court_event", "court_event", row.id, row.scheduled_at, f"Court: {row.event_type}", f"Court event is scheduled for {row.scheduled_at.isoformat()}.", row.matter_id, severity):
            created["court"] += 1

    task_rows = db.scalars(
        select(LegalTask).where(
            LegalTask.status.in_(["open", "in_progress"]),
            LegalTask.due_at.is_not(None),
            LegalTask.due_at <= now + timedelta(days=3),
        )
    ).all()
    for row in task_rows:
        severity = "urgent" if row.due_at and row.due_at < now else ("high" if row.priority in {"high", "urgent"} else "normal")
        if row.due_at and _create_reminder(db, "legal_task", "legal_task", row.id, row.due_at, f"Task due: {row.title}", f"Legal task is due at {row.due_at.isoformat()}.", row.matter_id, severity):
            created["task"] += 1

    installments = db.scalars(
        select(SettlementInstallment).where(
            SettlementInstallment.status.in_(["scheduled", "due", "partial", "overdue"]),
            SettlementInstallment.due_date <= date.today() + timedelta(days=3),
        )
    ).all()
    for row in installments:
        _recalculate_installment(db, row)
        settlement = db.get(Settlement, row.settlement_id)
        matter_id = settlement.matter_id if settlement else None
        due_dt = datetime.combine(row.due_date, datetime.min.time(), tzinfo=timezone.utc)
        severity = "urgent" if row.status == "overdue" else "high"
        if _create_reminder(db, "settlement_installment", "settlement_installment", row.id, due_dt, f"Settlement installment #{row.sequence_no}", f"Installment of M {row.amount_due} is due {row.due_date.isoformat()} (status: {row.status}).", matter_id, severity):
            created["installment"] += 1

    credentials = db.scalars(select(Credential).where(Credential.expiry_date.is_not(None))).all()
    for row in credentials:
        try:
            expiry = date.fromisoformat(str(row.expiry_date))
        except ValueError:
            continue
        if date.today() <= expiry <= date.today() + timedelta(days=60):
            due_dt = datetime.combine(expiry, datetime.min.time(), tzinfo=timezone.utc)
            if _create_reminder(db, "credential_expiry", "credential", row.id, due_dt, f"Credential expiry: {row.credential_type}", f"Professional credential expires on {expiry.isoformat()}.", None, "high"):
                created["credential"] += 1

    db.commit()
    return created


def mark_overdue_installments(db: Session) -> int:
    rows = db.scalars(
        select(SettlementInstallment).where(SettlementInstallment.status.in_(["scheduled", "due", "partial", "overdue"]))
    ).all()
    changed = 0
    touched_settlements: set[int] = set()
    for row in rows:
        previous = row.status
        _recalculate_installment(db, row)
        if row.status != previous:
            changed += 1
        touched_settlements.add(row.settlement_id)
    for settlement_id in touched_settlements:
        settlement = db.get(Settlement, settlement_id)
        items = db.scalars(select(SettlementInstallment).where(SettlementInstallment.settlement_id == settlement_id)).all()
        if settlement and any(item.status == "overdue" for item in items):
            settlement.status = "defaulted"
        elif settlement and items and all(item.status == "paid" for item in items):
            settlement.status = "completed"
    db.commit()
    return changed


class InstallmentScheduleInput(BaseModel):
    installment_count: int | None = Field(default=None, ge=1, le=240)
    grace_days: int = Field(default=3, ge=0, le=90)
    replace_existing: bool = False


class ReminderPatch(BaseModel):
    status: Literal["pending", "acknowledged", "dismissed"]


class PaymentRequestInput(BaseModel):
    amount: Decimal = Field(gt=0)
    customer_phone: str = Field(min_length=8, max_length=20)
    customer_name: str | None = None
    provider: str = "mpesa"
    payment_method: str = "mobile_money"
    settlement_id: int | None = None
    installment_id: int | None = None
    description: str | None = None


class IthutePayConfig:
    enabled = os.environ.get("ITHUTE_PAY_ENABLED", "false").strip().lower() == "true"
    base_url = os.environ.get("ITHUTE_PAY_BASE_URL", "https://api.pay.ithute.co.ls/api/v1").rstrip("/")
    api_key = os.environ.get("ITHUTE_PAY_API_KEY", "").strip()
    sign_requests = os.environ.get("ITHUTE_PAY_SIGN_REQUESTS", "true").strip().lower() == "true"
    webhook_secret = os.environ.get("ITHUTE_PAY_WEBHOOK_SECRET", "").strip()
    timeout = float(os.environ.get("ITHUTE_PAY_TIMEOUT_SECONDS", "30"))


pay_config = IthutePayConfig()


def _ipb_headers(method: str, path: str, raw_body: bytes, idempotency_key: str | None = None) -> dict[str, str]:
    if not pay_config.enabled or not pay_config.api_key:
        raise HTTPException(status_code=503, detail="Ithute Pay integration is not enabled/configured")
    if not pay_config.api_key.startswith(("ipb_test_", "ipb_live_")):
        raise HTTPException(status_code=503, detail="Configured Ithute Pay API key has an invalid prefix")
    headers = {"Authorization": f"Bearer {pay_config.api_key}", "Accept": "application/json", "Content-Type": "application/json"}
    if idempotency_key:
        headers["Idempotency-Key"] = idempotency_key
    if pay_config.sign_requests:
        timestamp = str(int(time.time()))
        nonce = secrets.token_urlsafe(18)
        body_hash = hashlib.sha256(raw_body).hexdigest()
        canonical = f"{timestamp}\n{nonce}\n{method.upper()}\n{path}\n{body_hash}".encode()
        signature = hmac.new(pay_config.api_key.encode(), canonical, hashlib.sha256).hexdigest()
        headers.update({"X-IPB-Timestamp": timestamp, "X-IPB-Nonce": nonce, "X-IPB-Signature": f"sha256={signature}"})
    return headers


async def _ithute_pay_request(method: str, path: str, payload: dict[str, Any] | None = None, idempotency_key: str | None = None) -> dict[str, Any]:
    raw = json.dumps(payload or {}, separators=(",", ":"), default=str).encode() if payload is not None else b""
    headers = _ipb_headers(method, f"/api/v1{path}", raw, idempotency_key)
    async with httpx.AsyncClient(timeout=pay_config.timeout) as client:
        response = await client.request(method, f"{pay_config.base_url}{path}", headers=headers, content=raw if payload is not None else None)
    try:
        body = response.json()
    except ValueError:
        body = {"detail": response.text}
    if not response.is_success:
        raise RuntimeError(body.get("detail") or f"Ithute Pay request failed ({response.status_code})")
    return body


def _ingest_successful_payment(db: Session, request_row: IthutePayRequest, resource: dict[str, Any]) -> RecoveryPayment:
    public_id = str(resource.get("public_id") or resource.get("id") or request_row.public_id or "")
    if not public_id:
        raise RuntimeError("Ithute Pay success response did not contain a payment ID")
    existing = db.scalar(select(RecoveryPayment).where(RecoveryPayment.source == "ithute_pay", RecoveryPayment.bank_reference == public_id))
    if existing:
        if existing.status != "matched":
            existing.status = "matched"
            _reconcile_matter(db, existing.matter_id)
            auto_allocate_payment(db, existing)
        return existing
    payment = RecoveryPayment(
        matter_id=request_row.matter_id,
        settlement_id=request_row.settlement_id,
        amount=Decimal(str(resource.get("amount") or request_row.amount)),
        currency=str(resource.get("currency") or request_row.currency),
        received_at=datetime.now(timezone.utc),
        payment_reference=str(resource.get("reference") or request_row.reference),
        bank_reference=public_id,
        channel=f"ithute_pay:{resource.get('provider') or request_row.provider}",
        payer_name=request_row.customer_name,
        source="ithute_pay",
        status="matched",
        reconciliation_note="Imported from a successful Ithute Pay payment intent.",
        remittance_status="pending",
    )
    db.add(payment); db.flush()
    _reconcile_matter(db, payment.matter_id)
    auto_allocate_payment(db, payment)
    return payment


@router.get("/ops/automation/dashboard")
def automation_dashboard(db: Session = Depends(get_db), user: User = Depends(require_automation("automation:read"))):
    return {
        "pending_reminders": db.scalar(select(func.count()).select_from(ReminderEvent).where(ReminderEvent.status == "pending")) or 0,
        "overdue_installments": db.scalar(select(func.count()).select_from(SettlementInstallment).where(SettlementInstallment.status == "overdue")) or 0,
        "due_installments": db.scalar(select(func.count()).select_from(SettlementInstallment).where(SettlementInstallment.status.in_(["due", "partial"]))) or 0,
        "ithute_pay_enabled": pay_config.enabled,
        "ithute_pay_active_requests": db.scalar(select(func.count()).select_from(IthutePayRequest).where(IthutePayRequest.status.in_(["created", "requires_confirmation", "awaiting_customer", "processing", "unknown"]))) or 0,
        "user": {"id": user.id, "full_name": user.full_name, "role": user.role},
    }


@router.post("/ops/automation/scan")
def run_automation_scan(request: Request, db: Session = Depends(get_db), user: User = Depends(require_automation("automation:*"))):
    overdue = mark_overdue_installments(db)
    reminders = scan_reminders(db)
    audit(db, request, user, "automation.scan", "automation", None, after={"overdue_status_changes": overdue, "reminders_created": reminders})
    db.commit()
    return {"overdue_status_changes": overdue, "reminders_created": reminders}


@router.get("/ops/reminders")
def list_reminders(status: str | None = "pending", db: Session = Depends(get_db), user: User = Depends(require_automation("reminder:read"))):
    stmt = select(ReminderEvent).order_by(ReminderEvent.due_at)
    if status:
        stmt = stmt.where(ReminderEvent.status == status)
    return [_serialize(row) for row in db.scalars(stmt).all()]


@router.patch("/ops/reminders/{reminder_id}")
def update_reminder(reminder_id: int, payload: ReminderPatch, request: Request, db: Session = Depends(get_db), user: User = Depends(require_automation("reminder:update"))):
    row = db.get(ReminderEvent, reminder_id)
    if not row:
        raise HTTPException(status_code=404, detail="Reminder not found")
    before = _serialize(row)
    row.status = payload.status
    if payload.status == "acknowledged":
        row.acknowledged_at = datetime.now(timezone.utc)
        row.acknowledged_by_id = user.id
    audit(db, request, user, "reminder.updated", "reminder_event", str(row.id), before=before, after=_serialize(row))
    db.commit(); return _serialize(row)


@router.get("/ops/settlement-installments")
def list_installments(settlement_id: int | None = None, matter_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_automation("schedule:read"))):
    stmt = select(SettlementInstallment).join(Settlement, Settlement.id == SettlementInstallment.settlement_id)
    if settlement_id:
        stmt = stmt.where(SettlementInstallment.settlement_id == settlement_id)
    if matter_id:
        stmt = stmt.where(Settlement.matter_id == matter_id)
    rows = db.scalars(stmt.order_by(SettlementInstallment.due_date, SettlementInstallment.sequence_no)).all()
    for row in rows:
        _recalculate_installment(db, row)
    db.commit()
    return [_serialize(row) for row in rows]


@router.post("/ops/settlements/{settlement_id}/installments/generate", status_code=201)
def generate_installments(settlement_id: int, payload: InstallmentScheduleInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_automation("schedule:create"))):
    settlement = db.get(Settlement, settlement_id)
    if not settlement:
        raise HTTPException(status_code=404, detail="Settlement not found")
    if not settlement.first_due_date:
        raise HTTPException(status_code=422, detail="Settlement requires a first due date")
    if not settlement.installment_amount and settlement.frequency != "once":
        raise HTTPException(status_code=422, detail="Settlement requires an installment amount")
    existing = db.scalars(select(SettlementInstallment).where(SettlementInstallment.settlement_id == settlement_id)).all()
    if existing and not payload.replace_existing:
        raise HTTPException(status_code=409, detail="Installment schedule already exists")
    if existing and payload.replace_existing:
        if db.scalar(select(func.count()).select_from(PaymentAllocation).join(SettlementInstallment).where(SettlementInstallment.settlement_id == settlement_id)):
            raise HTTPException(status_code=409, detail="Cannot replace a schedule that already has payment allocations")
        for item in existing:
            db.delete(item)
        db.flush()

    if settlement.frequency == "once":
        count = 1
        installment_amount = Decimal(settlement.agreed_amount)
    else:
        installment_amount = Decimal(settlement.installment_amount or 0)
        count = payload.installment_count or int((Decimal(settlement.agreed_amount) / installment_amount).to_integral_value(rounding="ROUND_CEILING"))
    if count > 240:
        raise HTTPException(status_code=422, detail="Installment schedule exceeds 240 entries")

    total = Decimal("0.00")
    created = []
    for index in range(count):
        remaining = Decimal(settlement.agreed_amount) - total
        amount = min(installment_amount, remaining)
        if amount <= 0:
            break
        due = _schedule_date(settlement.first_due_date, settlement.frequency or "monthly", index)
        item = SettlementInstallment(
            settlement_id=settlement.id,
            sequence_no=index + 1,
            due_date=due,
            grace_until=due + timedelta(days=payload.grace_days),
            amount_due=amount,
        )
        db.add(item); db.flush(); created.append(item); total += amount
    audit(db, request, user, "settlement_schedule.generated", "settlement", str(settlement.id), after={"installments": len(created), "grace_days": payload.grace_days})
    db.commit()
    return [_serialize(item) for item in created]


@router.get("/ops/payment-allocations")
def list_allocations(payment_id: int | None = None, settlement_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(require_automation("allocation:read"))):
    stmt = select(PaymentAllocation).join(SettlementInstallment, SettlementInstallment.id == PaymentAllocation.installment_id)
    if payment_id:
        stmt = stmt.where(PaymentAllocation.payment_id == payment_id)
    if settlement_id:
        stmt = stmt.where(SettlementInstallment.settlement_id == settlement_id)
    return [_serialize(row) for row in db.scalars(stmt.order_by(PaymentAllocation.created_at.desc())).all()]


@router.post("/ops/recovery-payments/{payment_id}/auto-allocate")
def allocate_payment(payment_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_automation("allocation:create"))):
    payment = db.get(RecoveryPayment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Recovery payment not found")
    allocations = auto_allocate_payment(db, payment, user.id)
    audit(db, request, user, "payment.auto_allocated", "recovery_payment", str(payment.id), after={"allocations": [str(row.amount) for row in allocations]})
    db.commit()
    return [_serialize(row) for row in allocations]


@router.get("/ops/ithute-pay/requests")
def list_ithute_pay_requests(db: Session = Depends(get_db), user: User = Depends(require_automation("ithute_pay:read"))):
    return [_serialize(row) for row in db.scalars(select(IthutePayRequest).order_by(IthutePayRequest.created_at.desc())).all()]


@router.post("/ops/matters/{matter_id}/ithute-pay/payment-request", status_code=201)
async def create_ithute_pay_payment_request(matter_id: int, payload: PaymentRequestInput, request: Request, db: Session = Depends(get_db), user: User = Depends(require_automation("ithute_pay:create"))):
    matter = db.get(Matter, matter_id)
    if not matter:
        raise HTTPException(status_code=404, detail="Matter not found")
    settlement = None
    installment = None
    if payload.settlement_id:
        settlement = db.get(Settlement, payload.settlement_id)
        if not settlement or settlement.matter_id != matter_id:
            raise HTTPException(status_code=422, detail="Settlement does not belong to matter")
    if payload.installment_id:
        installment = db.get(SettlementInstallment, payload.installment_id)
        if not installment:
            raise HTTPException(status_code=422, detail="Installment not found")
        linked_settlement = db.get(Settlement, installment.settlement_id)
        if not linked_settlement or linked_settlement.matter_id != matter_id:
            raise HTTPException(status_code=422, detail="Installment does not belong to matter")
        settlement = linked_settlement

    row = IthutePayRequest(
        matter_id=matter_id,
        settlement_id=settlement.id if settlement else None,
        installment_id=installment.id if installment else None,
        idempotency_key=f"lc-{matter.matter_reference.lower()}-{secrets.token_hex(8)}",
        amount=payload.amount,
        customer_phone=payload.customer_phone,
        customer_name=payload.customer_name,
        provider=payload.provider,
        payment_method=payload.payment_method,
        reference=(f"LC-{matter.matter_reference}-{int(time.time())}")[:100],
        description=(payload.description or f"Lelefa Chambers recovery payment for {matter.matter_reference}")[:255],
        created_by_id=user.id,
    )
    db.add(row); db.flush(); db.commit(); db.refresh(row)

    body = {
        "amount": str(row.amount),
        "currency": row.currency,
        "provider": row.provider,
        "payment_method": row.payment_method,
        "customer": {"phone": row.customer_phone, "name": row.customer_name},
        "reference": row.reference,
        "description": row.description,
        "metadata": {
            "consumer": "lelefa-chambers",
            "matter_id": matter.id,
            "matter_reference": matter.matter_reference,
            "client_reference": matter.client_reference,
            "settlement_id": row.settlement_id,
            "installment_id": row.installment_id,
            "local_payment_request_id": row.id,
        },
        "confirm": True,
    }
    try:
        result = await _ithute_pay_request("POST", "/payment-intents", body, row.idempotency_key)
        row.public_id = str(result.get("public_id") or result.get("id") or "") or None
        row.status = str(result.get("status") or "created")
        row.raw_last_response = result
        row.last_error = None
        if row.status == "succeeded":
            _ingest_successful_payment(db, row, result)
    except Exception as exc:
        row.status = "integration_error"
        row.last_error = str(exc)[:2000]
    audit(db, request, user, "ithute_pay.request.created", "ithute_pay_request", str(row.id), after={"public_id": row.public_id, "status": row.status, "amount": str(row.amount)})
    db.commit()
    return _serialize(row)


@router.post("/ops/ithute-pay/requests/{request_id}/refresh")
async def refresh_ithute_pay_request(request_id: int, request: Request, db: Session = Depends(get_db), user: User = Depends(require_automation("ithute_pay:refresh"))):
    row = db.get(IthutePayRequest, request_id)
    if not row:
        raise HTTPException(status_code=404, detail="Ithute Pay request not found")
    if not row.public_id:
        raise HTTPException(status_code=409, detail="Payment request has no Ithute Pay resource ID")
    try:
        result = await _ithute_pay_request("GET", f"/payment-intents/{row.public_id}")
        row.status = str(result.get("status") or row.status)
        row.raw_last_response = result
        row.last_error = None
        if row.status == "succeeded":
            _ingest_successful_payment(db, row, result)
    except Exception as exc:
        row.last_error = str(exc)[:2000]
        db.commit()
        raise HTTPException(status_code=502, detail=f"Ithute Pay refresh failed: {row.last_error}") from exc
    audit(db, request, user, "ithute_pay.request.refreshed", "ithute_pay_request", str(row.id), after={"public_id": row.public_id, "status": row.status})
    db.commit(); return _serialize(row)


def verify_ithute_pay_webhook(raw_body: bytes, signature_header: str, secret: str, tolerance_seconds: int = 300) -> bool:
    try:
        parts = dict(part.split("=", 1) for part in signature_header.split(","))
        timestamp = parts["t"]
        supplied = parts["v1"]
        if abs(int(time.time()) - int(timestamp)) > tolerance_seconds:
            return False
        signed = timestamp.encode() + b"." + raw_body
        expected = hmac.new(secret.encode(), signed, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, supplied)
    except (KeyError, ValueError):
        return False


@router.post("/integrations/ithute-pay/webhook", status_code=202)
async def ithute_pay_webhook(
    request: Request,
    x_ipb_signature: str | None = Header(default=None, alias="X-IPB-Signature"),
    x_ipb_event: str | None = Header(default=None, alias="X-IPB-Event"),
    x_ipb_event_id: str | None = Header(default=None, alias="X-IPB-Event-ID"),
    db: Session = Depends(get_db),
):
    raw = await request.body()
    if not pay_config.webhook_secret:
        raise HTTPException(status_code=503, detail="Ithute Pay webhook secret is not configured")
    if not x_ipb_signature or not verify_ithute_pay_webhook(raw, x_ipb_signature, pay_config.webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid Ithute Pay webhook signature")
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Invalid JSON webhook body") from exc
    event_id = x_ipb_event_id or str(payload.get("id") or "")
    event_type = x_ipb_event or str(payload.get("type") or "unknown")
    if not event_id:
        raise HTTPException(status_code=400, detail="Webhook event ID is required")
    existing = db.scalar(select(IthutePayWebhookEvent).where(IthutePayWebhookEvent.event_id == event_id))
    if existing:
        return {"accepted": True, "duplicate": True}
    event = IthutePayWebhookEvent(event_id=event_id, event_type=event_type, payload=payload)
    db.add(event); db.flush()

    data = payload.get("data") or {}
    payment_public_id = str(data.get("id") or data.get("public_id") or "")
    row = db.scalar(select(IthutePayRequest).where(IthutePayRequest.public_id == payment_public_id)) if payment_public_id else None
    if row:
        row.status = str(data.get("status") or event_type.removeprefix("payment.") or row.status)
        row.raw_last_response = data
        if event_type == "payment.succeeded" or row.status == "succeeded":
            _ingest_successful_payment(db, row, data)
        event.processed = True
        event.processing_note = f"Applied to IthutePayRequest #{row.id}."
    else:
        event.processed = False
        event.processing_note = "No matching Lelefa Chambers payment request was found."
    db.commit()
    return {"accepted": True, "duplicate": False, "processed": event.processed}
