import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "test-admin-password")
os.environ.setdefault("LEGAL_VAULT_DIR", "/tmp/lelefa-chambers-test-vault")

from app.main import Base
from app.recovery import recovery_allows
from app.server import app


def test_recovery_models_are_registered():
    expected = {
        "matter_documents",
        "matter_settlements",
        "matter_judgments",
        "execution_actions",
        "recovery_payments",
        "client_portal_users",
    }
    assert expected.issubset(set(Base.metadata.tables))


def test_recovery_routes_are_registered():
    paths = {route.path for route in app.routes}
    assert "/api/v1/ops/recovery/dashboard" in paths
    assert "/api/v1/ops/matters/{matter_id}/documents" in paths
    assert "/api/v1/ops/settlements" in paths
    assert "/api/v1/ops/judgments" in paths
    assert "/api/v1/ops/executions" in paths
    assert "/api/v1/ops/recovery-payments" in paths
    assert "/api/v1/client-portal/auth/login" in paths
    assert "/api/v1/client-portal/matters" in paths


def test_recovery_role_boundaries():
    assert recovery_allows("system_owner", "portal:create")
    assert recovery_allows("managing_advocate", "judgment:create")
    assert recovery_allows("advocate", "document:create")
    assert recovery_allows("auditor", "payment:read")
    assert not recovery_allows("auditor", "payment:update")
    assert not recovery_allows("reception", "judgment:create")


def test_private_vault_is_not_mounted_as_static_content():
    mounted_paths = {getattr(route, "path", None) for route in app.routes}
    assert "/legal-vault" not in mounted_paths
