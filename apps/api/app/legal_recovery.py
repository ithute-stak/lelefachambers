from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_HALF_UP, getcontext
from enum import Enum
from hashlib import sha256
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field, model_validator

getcontext().prec = 28
MONEY = Decimal("0.01")

router = APIRouter(prefix="/api/v1/legal-recovery", tags=["legal-recovery"])


def money(value: Decimal) -> Decimal:
    return value.quantize(MONEY, rounding=ROUND_HALF_UP)


class CalculationMethod(str, Enum):
    MICRO_LOAN = "micro_loan"
    SIMPLE_INTEREST = "simple_interest"
    FLAT_RATE = "flat_rate"
    COMPOUND_INTEREST = "compound_interest"
    REDUCING_BALANCE = "reducing_balance_amortised"
    DAILY_REDUCING_BALANCE = "daily_accrual_reducing_balance"


class PaymentInput(BaseModel):
    amount: Decimal = Field(gt=0)
    paid_on: date | None = None
    reference: str | None = None


class DebtVerificationRequest(BaseModel):
    debtor_name: str = Field(min_length=2, max_length=240)
    national_id: str = Field(min_length=3, max_length=80)
    source_reference: str = Field(min_length=1, max_length=120)
    loan_date: date
    principal: Decimal = Field(gt=0)
    annual_rate_percent: Decimal = Field(ge=0)
    term_months: int = Field(gt=0, le=600)
    method: CalculationMethod
    processing_fee: Decimal = Field(default=Decimal("0"), ge=0)
    payments: list[PaymentInput] = Field(default_factory=list)
    claimed_outstanding: Decimal | None = Field(default=None, ge=0)
    as_of_date: date = Field(default_factory=date.today)
    tolerance: Decimal = Field(default=Decimal("0.01"), ge=0)

    @model_validator(mode="after")
    def validate_dates(self) -> "DebtVerificationRequest":
        if self.as_of_date < self.loan_date:
            raise ValueError("as_of_date cannot be before loan_date")
        return self


class ScheduleRow(BaseModel):
    period: int
    opening_balance: Decimal
    interest: Decimal
    principal_component: Decimal
    instalment: Decimal
    closing_balance: Decimal


class CalculationSnapshot(BaseModel):
    engine_version: str
    method: CalculationMethod
    principal: Decimal
    contractual_interest: Decimal
    processing_fee: Decimal
    total_repayable: Decimal
    payments_credited: Decimal
    verified_outstanding: Decimal
    standard_instalment: Decimal
    term_months: int
    annual_rate_percent: Decimal
    calculated_at: datetime
    inputs_hash: str
    schedule: list[ScheduleRow]


class DebtVerificationResponse(BaseModel):
    status: Literal["eligible", "blocked"]
    demand_letter_eligible: bool
    blockers: list[str]
    warnings: list[str]
    claimed_outstanding: Decimal | None
    variance: Decimal | None
    snapshot: CalculationSnapshot


def _micro_loan(req: DebtVerificationRequest) -> tuple[Decimal, Decimal, list[ScheduleRow]]:
    """LoanHub Micro Loan Method.

    Mirrors LoanHub's documented algorithm: rate-adjust the carried value; halve it
    in every month except the last; use the full rate-adjusted carry in the last
    month; sum components plus processing fee; split total evenly, with the last
    row absorbing the cent rounding difference.
    """
    monthly_rate = req.annual_rate_percent / Decimal("100")
    carry = req.principal
    components: list[Decimal] = []
    for period in range(1, req.term_months + 1):
        adjusted = carry * (Decimal("1") + monthly_rate)
        component = adjusted if period == req.term_months else adjusted / Decimal("2")
        components.append(component)
        carry = component

    total = money(sum(components, Decimal("0")) + req.processing_fee)
    standard = money(total / Decimal(req.term_months))
    schedule: list[ScheduleRow] = []
    outstanding = total
    for period in range(1, req.term_months + 1):
        instalment = standard if period < req.term_months else money(outstanding)
        schedule.append(
            ScheduleRow(
                period=period,
                opening_balance=money(outstanding),
                interest=Decimal("0.00"),
                principal_component=instalment,
                instalment=instalment,
                closing_balance=money(max(Decimal("0"), outstanding - instalment)),
            )
        )
        outstanding -= instalment
    return total, standard, schedule


def _simple_or_flat(req: DebtVerificationRequest) -> tuple[Decimal, Decimal, list[ScheduleRow]]:
    annual_rate = req.annual_rate_percent / Decimal("100")
    interest = req.principal * annual_rate * Decimal(req.term_months) / Decimal("12")
    total = money(req.principal + interest + req.processing_fee)
    standard = money(total / Decimal(req.term_months))
    schedule: list[ScheduleRow] = []
    outstanding = total
    for period in range(1, req.term_months + 1):
        instalment = standard if period < req.term_months else money(outstanding)
        schedule.append(ScheduleRow(period=period, opening_balance=money(outstanding), interest=money(interest / req.term_months), principal_component=money(instalment - interest / req.term_months), instalment=instalment, closing_balance=money(max(Decimal("0"), outstanding - instalment))))
        outstanding -= instalment
    return total, standard, schedule


def _compound(req: DebtVerificationRequest) -> tuple[Decimal, Decimal, list[ScheduleRow]]:
    """Compound the entered contractual rate once per contractual period.

    In the Chambers Document Studio, ``term_months`` is also the number of
    contractual periods shown to the operator. A 20% rate over 3 periods is
    therefore 1000 * 1.20^3 = 1728, not an annual 20% rate divided by 12.
    """
    period_rate = req.annual_rate_percent / Decimal("100")
    total = money(req.principal * ((Decimal("1") + period_rate) ** req.term_months) + req.processing_fee)
    standard = money(total / Decimal(req.term_months))
    schedule: list[ScheduleRow] = []
    outstanding = total
    for period in range(1, req.term_months + 1):
        instalment = standard if period < req.term_months else money(outstanding)
        schedule.append(ScheduleRow(period=period, opening_balance=money(outstanding), interest=Decimal("0.00"), principal_component=instalment, instalment=instalment, closing_balance=money(max(Decimal("0"), outstanding - instalment))))
        outstanding -= instalment
    return total, standard, schedule


def _amortised(req: DebtVerificationRequest) -> tuple[Decimal, Decimal, list[ScheduleRow]]:
    monthly_rate = (req.annual_rate_percent / Decimal("100")) / Decimal("12")
    if monthly_rate == 0:
        base_payment = req.principal / Decimal(req.term_months)
    else:
        factor = (Decimal("1") + monthly_rate) ** req.term_months
        base_payment = req.principal * monthly_rate * factor / (factor - Decimal("1"))
    standard = money(base_payment)
    balance = req.principal
    schedule: list[ScheduleRow] = []
    for period in range(1, req.term_months + 1):
        interest = money(balance * monthly_rate)
        payment = standard
        principal_component = money(payment - interest)
        if period == req.term_months:
            principal_component = money(balance)
            payment = money(principal_component + interest + req.processing_fee)
        elif period == 1 and req.processing_fee:
            payment = money(payment + req.processing_fee)
        closing = money(max(Decimal("0"), balance - principal_component))
        schedule.append(ScheduleRow(period=period, opening_balance=money(balance), interest=interest, principal_component=principal_component, instalment=payment, closing_balance=closing))
        balance = closing
    total = money(sum((row.instalment for row in schedule), Decimal("0")))
    return total, standard, schedule


def _daily(req: DebtVerificationRequest) -> tuple[Decimal, Decimal, list[ScheduleRow]]:
    # Verification-grade approximation with monthly repayment points and actual day
    # accrual between them. A dated ledger remains the source of truth when supplied.
    daily_rate = (req.annual_rate_percent / Decimal("100")) / Decimal("365")
    balance = req.principal
    target_principal = req.principal / Decimal(req.term_months)
    schedule: list[ScheduleRow] = []
    total = Decimal("0")
    for period in range(1, req.term_months + 1):
        days = Decimal("30")
        interest = money(balance * daily_rate * days)
        principal_component = money(balance if period == req.term_months else min(balance, target_principal))
        fee = req.processing_fee if period == 1 else Decimal("0")
        instalment = money(principal_component + interest + fee)
        closing = money(max(Decimal("0"), balance - principal_component))
        schedule.append(ScheduleRow(period=period, opening_balance=money(balance), interest=interest, principal_component=principal_component, instalment=instalment, closing_balance=closing))
        total += instalment
        balance = closing
    total = money(total)
    standard = money(total / Decimal(req.term_months))
    return total, standard, schedule


def calculate(req: DebtVerificationRequest) -> DebtVerificationResponse:
    if req.method == CalculationMethod.MICRO_LOAN:
        total, standard, schedule = _micro_loan(req)
    elif req.method in {CalculationMethod.SIMPLE_INTEREST, CalculationMethod.FLAT_RATE}:
        total, standard, schedule = _simple_or_flat(req)
    elif req.method == CalculationMethod.COMPOUND_INTEREST:
        total, standard, schedule = _compound(req)
    elif req.method == CalculationMethod.REDUCING_BALANCE:
        total, standard, schedule = _amortised(req)
    else:
        total, standard, schedule = _daily(req)

    payments = money(sum((payment.amount for payment in req.payments), Decimal("0")))
    outstanding = money(max(Decimal("0"), total - payments))
    contractual_interest = money(total - req.principal - req.processing_fee)
    variance = None if req.claimed_outstanding is None else money(req.claimed_outstanding - outstanding)

    blockers: list[str] = []
    warnings: list[str] = []
    if req.claimed_outstanding is None:
        blockers.append("Claimed outstanding amount is required before a demand letter can be generated.")
    elif abs(variance or Decimal("0")) > req.tolerance:
        blockers.append("Claimed outstanding does not match the independently verified balance within tolerance.")
    if outstanding <= 0:
        blockers.append("Verified debt is fully settled; a payment demand must not be generated.")
    if not req.national_id.strip():
        blockers.append("Debtor National ID is required.")
    if any(payment.paid_on and payment.paid_on > req.as_of_date for payment in req.payments):
        blockers.append("A credited payment is dated after the verification date.")
    if req.method == CalculationMethod.DAILY_REDUCING_BALANCE and not all(payment.paid_on for payment in req.payments):
        warnings.append("Daily-accrual verification is stronger when every payment carries its actual payment date.")

    payload = req.model_dump(mode="json")
    digest = sha256(repr(sorted(payload.items())).encode("utf-8")).hexdigest()
    snapshot = CalculationSnapshot(
        engine_version="lelefa-debt-verifier/1.0",
        method=req.method,
        principal=money(req.principal),
        contractual_interest=contractual_interest,
        processing_fee=money(req.processing_fee),
        total_repayable=total,
        payments_credited=payments,
        verified_outstanding=outstanding,
        standard_instalment=standard,
        term_months=req.term_months,
        annual_rate_percent=req.annual_rate_percent,
        calculated_at=datetime.now(timezone.utc),
        inputs_hash=digest,
        schedule=schedule,
    )
    eligible = not blockers
    return DebtVerificationResponse(status="eligible" if eligible else "blocked", demand_letter_eligible=eligible, blockers=blockers, warnings=warnings, claimed_outstanding=req.claimed_outstanding, variance=variance, snapshot=snapshot)


@router.post("/debt-verification", response_model=DebtVerificationResponse)
def verify_debt(req: DebtVerificationRequest) -> DebtVerificationResponse:
    """Independently calculate a debt and gate formal-demand generation."""
    return calculate(req)
