from __future__ import annotations

import os
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from redis import Redis
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.main import SessionLocal, User, current_user, settings

router = APIRouter(tags=["platform-health"])
_started_at = time.monotonic()


def _database_status() -> tuple[bool, str]:
    try:
        with SessionLocal() as db:
            db.execute(text("SELECT 1"))
        return True, "ok"
    except SQLAlchemyError as exc:
        return False, exc.__class__.__name__


def _redis_status() -> tuple[bool, str]:
    try:
        client = Redis.from_url(settings.redis_url, socket_connect_timeout=1.5, socket_timeout=1.5)
        return (True, "ok") if client.ping() else (False, "ping_failed")
    except Exception as exc:
        return False, exc.__class__.__name__


def _security_posture() -> dict[str, object]:
    environment = os.getenv("APP_ENV", "development").lower()
    placeholder_tokens = {"development-only-change-me", "change-me", "ci-secret-only"}
    jwt_is_placeholder = settings.jwt_secret in placeholder_tokens or len(settings.jwt_secret) < 32
    return {
        "environment": environment,
        "jwt_secret_strength_ok": not jwt_is_placeholder,
        "cors_restricted": "*" not in settings.cors_origins,
        "database_url_present": bool(settings.database_url),
        "redis_url_present": bool(settings.redis_url),
    }


@router.get("/health/live")
def liveness():
    return {
        "status": "ok",
        "service": "lelefa-chambers-api",
        "utc": datetime.now(timezone.utc).isoformat(),
        "uptime_seconds": round(time.monotonic() - _started_at, 2),
    }


@router.get("/health/ready")
def readiness():
    db_ok, db_detail = _database_status()
    redis_ok, redis_detail = _redis_status()
    ready = db_ok and redis_ok
    payload = {
        "status": "ready" if ready else "not_ready",
        "dependencies": {
            "postgresql": {"ok": db_ok, "detail": db_detail},
            "redis": {"ok": redis_ok, "detail": redis_detail},
        },
        "utc": datetime.now(timezone.utc).isoformat(),
    }
    if not ready:
        raise HTTPException(status_code=503, detail=payload)
    return payload


@router.get("/api/v1/admin/system-status")
def admin_system_status(user: User = Depends(current_user)):
    if user.role not in {"system_owner", "chambers_admin", "managing_advocate", "auditor"}:
        raise HTTPException(status_code=403, detail="Insufficient permission")
    db_ok, db_detail = _database_status()
    redis_ok, redis_detail = _redis_status()
    return {
        "service": "Lelefa Chambers Digital Legal Practice Platform",
        "api": "ok",
        "postgresql": {"ok": db_ok, "detail": db_detail},
        "redis": {"ok": redis_ok, "detail": redis_detail},
        "security": _security_posture(),
        "uptime_seconds": round(time.monotonic() - _started_at, 2),
        "utc": datetime.now(timezone.utc).isoformat(),
    }
