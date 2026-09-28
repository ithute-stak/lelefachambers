from decimal import Decimal

from app.legal_recovery import CalculationMethod, DebtVerificationRequest, PaymentInput, calculate


def test_micro_loan_matches_loanhub_reference_example():
    result = calculate(
        DebtVerificationRequest(
            debtor_name="Reference Borrower",
            national_id="123456789",
            source_reference="TEST-001",
            loan_date="2026-01-01",
            principal=Decimal("1000"),
            annual_rate_percent=Decimal("20"),
            term_months=3,
            method=CalculationMethod.MICRO_LOAN,
            claimed_outstanding=Decimal("1392"),
            as_of_date="2026-01-01",
        )
    )

    assert result.snapshot.total_repayable == Decimal("1392.00")
    assert result.snapshot.standard_instalment == Decimal("464.00")
    assert [row.instalment for row in result.snapshot.schedule] == [
        Decimal("464.00"),
        Decimal("464.00"),
        Decimal("464.00"),
    ]
    assert result.demand_letter_eligible is True


def test_payments_are_credited_before_demand_eligibility():
    result = calculate(
        DebtVerificationRequest(
            debtor_name="Reference Borrower",
            national_id="123456789",
            source_reference="TEST-002",
            loan_date="2026-01-01",
            principal=Decimal("1000"),
            annual_rate_percent=Decimal("20"),
            term_months=3,
            method=CalculationMethod.MICRO_LOAN,
            payments=[PaymentInput(amount=Decimal("464"), paid_on="2026-02-01")],
            claimed_outstanding=Decimal("928"),
            as_of_date="2026-02-01",
        )
    )

    assert result.snapshot.payments_credited == Decimal("464.00")
    assert result.snapshot.verified_outstanding == Decimal("928.00")
    assert result.demand_letter_eligible is True


def test_mismatched_claim_is_blocked():
    result = calculate(
        DebtVerificationRequest(
            debtor_name="Reference Borrower",
            national_id="123456789",
            source_reference="TEST-003",
            loan_date="2026-01-01",
            principal=Decimal("1000"),
            annual_rate_percent=Decimal("20"),
            term_months=3,
            method=CalculationMethod.MICRO_LOAN,
            claimed_outstanding=Decimal("1400"),
            as_of_date="2026-01-01",
        )
    )

    assert result.demand_letter_eligible is False
    assert result.status == "blocked"
    assert result.variance == Decimal("8.00")
    assert any("does not match" in blocker for blocker in result.blockers)


def test_fully_paid_debt_cannot_generate_payment_demand():
    result = calculate(
        DebtVerificationRequest(
            debtor_name="Reference Borrower",
            national_id="123456789",
            source_reference="TEST-004",
            loan_date="2026-01-01",
            principal=Decimal("1000"),
            annual_rate_percent=Decimal("20"),
            term_months=3,
            method=CalculationMethod.MICRO_LOAN,
            payments=[PaymentInput(amount=Decimal("1392"), paid_on="2026-03-01")],
            claimed_outstanding=Decimal("0"),
            as_of_date="2026-03-01",
        )
    )

    assert result.snapshot.verified_outstanding == Decimal("0.00")
    assert result.demand_letter_eligible is False
    assert any("fully settled" in blocker for blocker in result.blockers)
