import os

os.environ.setdefault("DATABASE_URL", "sqlite+pysqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ.setdefault("BOOTSTRAP_ADMIN_PASSWORD", "test-admin-password")

from app.main import Base
from app.operations import ops_allows
from app.server import app


def test_legal_operations_models_are_registered():
    expected = {
        "legal_clients",
        "legal_matters",
        "matter_parties",
        "court_events",
        "legal_tasks",
        "conflict_checks",
        "recovery_referrals",
    }
    assert expected.issubset(set(Base.metadata.tables))


def test_operations_routes_are_registered():
    paths = {route.path for route in app.routes}
    assert "/api/v1/ops/dashboard" in paths
    assert "/api/v1/ops/matters" in paths
    assert "/api/v1/ops/conflict-checks" in paths
    assert "/api/v1/integrations/lelefa-debt-collectors/referrals" in paths


def test_role_boundaries():
    assert ops_allows("system_owner", "user:create")
    assert ops_allows("managing_advocate", "matter:create")
    assert ops_allows("advocate", "matter:update")
    assert not ops_allows("reception", "matter:update")
    assert not ops_allows("auditor", "matter:update")
