"""Baseline the current Lelefa Chambers schema.

Revision ID: 0001_baseline
Revises: None
Create Date: 2026-09-22

For a fresh database, this revision creates the schema represented by the current SQLAlchemy metadata.
For an existing Lelefa Chambers installation that was created with SQLAlchemy create_all, first verify
that its schema matches the application models and then use `alembic stamp 0001_baseline` instead of
running this upgrade. Never stamp an unverified production database.
"""

from typing import Sequence, Union

from alembic import op

from app.server import app  # noqa: F401 - registers every application model
from app.main import Base

revision: str = "0001_baseline"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind, checkfirst=True)


def downgrade() -> None:
    raise RuntimeError(
        "The baseline migration is intentionally non-destructive. Restore from a verified backup "
        "instead of dropping the entire legal-practice schema."
    )
