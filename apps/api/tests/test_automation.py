import hashlib
import hmac
import os
import time
from datetime import date

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("LEGAL_VAULT_DIR", "/tmp/lelefa-chambers-test-vault")
os.environ.setdefault("ITHUTE_PAY_ENABLED", "false")
os.environ.setdefault("ITHUTE_PAY_API_KEY", "ipb_test_not-enabled")

from app.automation import (
    _month_add,
    _schedule_date,
    automation_allows,
    pay_config,
    verify_ithute_pay_webhook,
)
from app.main import Base
from app.server import app


def test_automation_models_are_registered():
    expected = {
        "settlement_installments",
        "payment_allocations",
        "reminder_events",
        "ithute_pay_requests",
        "ithute_pay_webhook_events",
    }
    assert expected.issubset(set(Base.metadata.tables))


def test_automation_routes_are_registered():
    paths = {route.path for route in app.routes}
    assert "/api/v1/ops/automation/dashboard" in paths
    assert "/api/v1/ops/automation/scan" in paths
    assert "/api/v1/ops/reminders" in paths
    assert "/api/v1/ops/settlements/{settlement_id}/installments/generate" in paths
    assert "/api/v1/ops/recovery-payments/{payment_id}/auto-allocate" in paths
    assert "/api/v1/ops/matters/{matter_id}/ithute-pay/payment-request" in paths
    assert "/api/v1/ops/ithute-pay/requests/{request_id}/refresh" in paths
    assert "/api/v1/integrations/ithute-pay/webhook" in paths


def test_automation_role_boundaries():
    assert automation_allows("system_owner", "ithute_pay:create")
    assert automation_allows("managing_advocate", "automation:read")
    assert automation_allows("advocate", "schedule:create")
    assert automation_allows("advocate", "ithute_pay:refresh")
    assert automation_allows("auditor", "ithute_pay:read")
    assert not automation_allows("auditor", "ithute_pay:create")
    assert not automation_allows("reception", "schedule:create")


def test_month_schedule_handles_end_of_month():
    assert _month_add(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert _month_add(date(2028, 1, 31), 1) == date(2028, 2, 29)
    assert _schedule_date(date(2026, 9, 30), "monthly", 1) == date(2026, 10, 30)
    assert _schedule_date(date(2026, 9, 22), "weekly", 2) == date(2026, 10, 6)


def test_ithute_pay_webhook_verification_accepts_valid_signature():
    body = b'{"id":"evt_123","type":"payment.succeeded","data":{"id":"pi_123"}}'
    secret = "webhook-test-secret"
    timestamp = str(int(time.time()))
    signature = hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    header = f"t={timestamp},v1={signature}"
    assert verify_ithute_pay_webhook(body, header, secret)
    assert not verify_ithute_pay_webhook(body + b"x", header, secret)


def test_ithute_pay_stays_disabled_without_explicit_activation():
    assert pay_config.enabled is False
