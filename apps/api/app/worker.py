from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timezone

from redis.asyncio import Redis
from sqlalchemy import select

# Import server first so every model is registered on Base metadata.
from app import server  # noqa: F401
from app.automation import ReminderEvent, auto_allocate_payment, mark_overdue_installments, scan_reminders
from app.main import SessionLocal, settings
from app.recovery import RecoveryPayment

logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
logger = logging.getLogger("lelefa-chambers-worker")

INTERVAL_SECONDS = max(int(os.environ.get("AUTOMATION_SCAN_SECONDS", "60")), 15)
REDIS_STREAM = os.environ.get("REMINDER_REDIS_STREAM", "lelefa:chambers:reminders")


async def publish_pending_reminders() -> int:
    if not settings.redis_url:
        return 0
    client = Redis.from_url(settings.redis_url, decode_responses=True)
    published = 0
    try:
        with SessionLocal() as db:
            rows = db.scalars(
                select(ReminderEvent)
                .where(ReminderEvent.status == "pending", ReminderEvent.published_at.is_(None))
                .order_by(ReminderEvent.due_at)
                .limit(200)
            ).all()
            for row in rows:
                await client.xadd(
                    REDIS_STREAM,
                    {
                        "id": str(row.id),
                        "type": row.reminder_type,
                        "matter_id": str(row.matter_id or ""),
                        "severity": row.severity,
                        "title": row.title,
                        "message": row.message,
                        "due_at": row.due_at.isoformat(),
                    },
                    maxlen=10000,
                    approximate=True,
                )
                row.published_at = datetime.now(timezone.utc)
                published += 1
            db.commit()
    finally:
        await client.aclose()
    return published


def allocate_unallocated_installment_payments() -> int:
    count = 0
    with SessionLocal() as db:
        rows = db.scalars(
            select(RecoveryPayment).where(
                RecoveryPayment.status == "matched",
                RecoveryPayment.settlement_id.is_not(None),
            ).order_by(RecoveryPayment.received_at)
        ).all()
        for payment in rows:
            allocations = auto_allocate_payment(db, payment)
            if allocations:
                count += len(allocations)
        db.commit()
    return count


def scan_database() -> dict:
    with SessionLocal() as db:
        changed = mark_overdue_installments(db)
        created = scan_reminders(db)
    allocations = allocate_unallocated_installment_payments()
    return {
        "installment_status_changes": changed,
        "reminders": created,
        "allocations": allocations,
    }


async def cycle() -> None:
    results = scan_database()
    try:
        published = await publish_pending_reminders()
    except Exception:
        logger.exception("Could not publish reminders to Redis; database reminders remain pending")
        published = 0
    logger.info("automation cycle: %s, redis_published=%s", json.dumps(results, default=str), published)


async def main() -> None:
    logger.info("Lelefa Chambers automation worker starting; interval=%ss", INTERVAL_SECONDS)
    while True:
        try:
            await cycle()
        except Exception:
            logger.exception("Recovery automation cycle failed")
        await asyncio.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    asyncio.run(main())
