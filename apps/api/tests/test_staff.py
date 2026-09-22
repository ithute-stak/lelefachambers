from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.staff import ROLE_CATALOG, ensure_can_manage


def actor(role: str):
    return SimpleNamespace(role=role)


def target(role: str):
    return SimpleNamespace(role=role)


def test_role_catalog_contains_expected_staff_roles():
    values = {item["value"] for item in ROLE_CATALOG}
    assert {
        "system_owner",
        "chambers_admin",
        "managing_advocate",
        "advocate",
        "content_editor",
        "reception",
        "auditor",
    } <= values


def test_chambers_admin_cannot_manage_system_owner():
    with pytest.raises(HTTPException) as exc:
        ensure_can_manage(actor("chambers_admin"), target=target("system_owner"))
    assert exc.value.status_code == 403


def test_chambers_admin_cannot_promote_to_system_owner():
    with pytest.raises(HTTPException) as exc:
        ensure_can_manage(actor("chambers_admin"), requested_role="system_owner")
    assert exc.value.status_code == 403


def test_system_owner_can_manage_all_roles():
    ensure_can_manage(actor("system_owner"), target=target("system_owner"), requested_role="system_owner")
