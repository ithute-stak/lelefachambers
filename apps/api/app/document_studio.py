from __future__ import annotations

from datetime import date, timedelta
from html import escape

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.legal_recovery import DebtVerificationRequest, DebtVerificationResponse, calculate, money
from app.main import User, current_user

router = APIRouter(prefix="/api/v1/document-studio", tags=["document-studio"])


class DemandLetterRequest(BaseModel):
    verification: DebtVerificationRequest
    client_name: str = Field(min_length=2, max_length=240)
    client_reference: str | None = Field(default=None, max_length=120)
    chambers_reference: str = Field(min_length=1, max_length=120)
    debtor_address: str | None = Field(default=None, max_length=600)
    demand_days: int = Field(default=7, ge=1, le=90)
    payment_instructions: str | None = Field(default=None, max_length=1200)
    additional_notice: str | None = Field(default=None, max_length=1200)
    signatory_name: str = Field(default="ADVOCATE MATS'EPE LELEFA, LLM", min_length=2, max_length=240)
    signatory_title: str = Field(default="Managing Partner", min_length=2, max_length=160)
    letter_date: date = Field(default_factory=date.today)


class DemandLetterPreview(BaseModel):
    eligible: bool
    blockers: list[str]
    warnings: list[str]
    verification: DebtVerificationResponse
    subject: str
    salutation: str
    body_paragraphs: list[str]
    amount_summary: dict[str, str]
    deadline: date
    signatory_name: str
    signatory_title: str
    html: str | None = None


def _format_money(value) -> str:
    return f"M {money(value):,.2f}"


def build_demand_letter(req: DemandLetterRequest) -> DemandLetterPreview:
    verification = calculate(req.verification)
    deadline = req.letter_date + timedelta(days=req.demand_days)
    snapshot = verification.snapshot

    subject = f"FORMAL DEMAND FOR PAYMENT — {req.chambers_reference}"
    salutation = f"Dear {req.verification.debtor_name},"

    paragraphs = [
        (
            f"We act on behalf of {req.client_name}. We refer to the debt recorded under source "
            f"reference {req.verification.source_reference} and Chambers reference {req.chambers_reference}."
        ),
        (
            f"Our independent verification records principal of {_format_money(snapshot.principal)}, "
            f"contractual interest of {_format_money(snapshot.contractual_interest)}, processing fees of "
            f"{_format_money(snapshot.processing_fee)}, and payments credited of "
            f"{_format_money(snapshot.payments_credited)}. The verified outstanding balance is "
            f"{_format_money(snapshot.verified_outstanding)} as at {req.verification.as_of_date.isoformat()}."
        ),
        (
            f"You are hereby called upon to pay the verified outstanding balance in full within "
            f"{req.demand_days} days, on or before {deadline.isoformat()}."
        ),
        (
            "If you dispute the balance, you should promptly provide the supporting payment records or other "
            "documents on which you rely so that the account can be reviewed before further recovery steps are considered."
        ),
    ]

    if req.payment_instructions:
        paragraphs.append(f"Payment instructions: {req.payment_instructions.strip()}")
    if req.additional_notice:
        paragraphs.append(req.additional_notice.strip())

    amount_summary = {
        "principal": _format_money(snapshot.principal),
        "contractual_interest": _format_money(snapshot.contractual_interest),
        "processing_fee": _format_money(snapshot.processing_fee),
        "payments_credited": _format_money(snapshot.payments_credited),
        "verified_outstanding": _format_money(snapshot.verified_outstanding),
    }

    html = None
    if verification.demand_letter_eligible:
        address = "" if not req.debtor_address else f"<p class='address'>{escape(req.debtor_address)}</p>"
        client_ref = "" if not req.client_reference else f"<div><strong>Client ref:</strong> {escape(req.client_reference)}</div>"
        paragraph_html = "".join(f"<p>{escape(p)}</p>" for p in paragraphs)
        html = f"""<!doctype html>
<html>
<head>
<meta charset='utf-8'>
<title>{escape(subject)}</title>
<style>
body{{font-family:Georgia,'Times New Roman',serif;color:#111;max-width:780px;margin:48px auto;line-height:1.55;font-size:15px}}
.letterhead{{border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:24px}}
.letterhead h1{{margin:0;font-size:24px;letter-spacing:.04em}}
.meta{{font-family:Arial,sans-serif;font-size:12px;margin:18px 0 28px}}
.subject{{font-weight:700;text-transform:uppercase;margin:24px 0}}
.summary{{width:100%;border-collapse:collapse;margin:22px 0;font-family:Arial,sans-serif;font-size:13px}}
.summary td{{padding:8px 10px;border-bottom:1px solid #ddd}}
.summary td:last-child{{text-align:right;font-weight:700}}
.signature{{margin-top:42px}}
.address{{white-space:pre-line}}
</style>
</head>
<body>
<div class='letterhead'><h1>LELEFA CHAMBERS</h1><div>Advocates • Legal Recovery • Litigation</div></div>
<div class='meta'>
<div><strong>Date:</strong> {req.letter_date.isoformat()}</div>
<div><strong>Chambers ref:</strong> {escape(req.chambers_reference)}</div>
{client_ref}
<div><strong>Source ref:</strong> {escape(req.verification.source_reference)}</div>
<div><strong>National ID:</strong> {escape(req.verification.national_id)}</div>
</div>
<strong>{escape(req.verification.debtor_name)}</strong>
{address}
<p class='subject'>{escape(subject)}</p>
<p>{escape(salutation)}</p>
{paragraph_html}
<table class='summary'>
<tr><td>Principal</td><td>{amount_summary['principal']}</td></tr>
<tr><td>Contractual interest</td><td>{amount_summary['contractual_interest']}</td></tr>
<tr><td>Processing fee</td><td>{amount_summary['processing_fee']}</td></tr>
<tr><td>Payments credited</td><td>{amount_summary['payments_credited']}</td></tr>
<tr><td>Verified outstanding</td><td>{amount_summary['verified_outstanding']}</td></tr>
</table>
<div class='signature'>Yours faithfully,<br><br><strong>{escape(req.signatory_name)}</strong><br>{escape(req.signatory_title)}<br>Lelefa Chambers</div>
</body>
</html>"""

    return DemandLetterPreview(
        eligible=verification.demand_letter_eligible,
        blockers=verification.blockers,
        warnings=verification.warnings,
        verification=verification,
        subject=subject,
        salutation=salutation,
        body_paragraphs=paragraphs,
        amount_summary=amount_summary,
        deadline=deadline,
        signatory_name=req.signatory_name,
        signatory_title=req.signatory_title,
        html=html,
    )


@router.post("/demand-letter/preview", response_model=DemandLetterPreview)
def preview_demand_letter(
    req: DemandLetterRequest,
    _user: User = Depends(current_user),
) -> DemandLetterPreview:
    return build_demand_letter(req)


@router.post("/demand-letter/render-html")
def render_demand_letter_html(
    req: DemandLetterRequest,
    _user: User = Depends(current_user),
):
    result = build_demand_letter(req)
    if not result.eligible or not result.html:
        raise HTTPException(status_code=409, detail={"message": "Demand letter is blocked by debt verification", "blockers": result.blockers})
    return {"html": result.html, "verification_hash": result.verification.snapshot.inputs_hash, "deadline": result.deadline.isoformat()}
