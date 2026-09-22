import os

from app.production import _validate_production_configuration, liveness


def test_liveness_is_process_only():
    payload = liveness()
    assert payload["status"] == "ok"
    assert payload["service"] == "lelefa-chambers-api"
    assert payload["uptime_seconds"] >= 0


def test_development_does_not_apply_production_secret_guard(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    assert _validate_production_configuration() == []


def test_production_rejects_ci_or_placeholder_jwt(monkeypatch):
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("BOOTSTRAP_ADMIN_PASSWORD", "a-production-only-bootstrap-password")
    failures = _validate_production_configuration()
    assert any("JWT_SECRET" in item for item in failures)
