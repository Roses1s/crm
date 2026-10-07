"""Добавить назначенного бухгалтера к лиду.

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-10-07 09:00:00.000000+05:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f4a5b6c7d8e9"
down_revision: str | None = "e3f4a5b6c7d8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Старые лиды остаются без назначенного бухгалтера.
    op.add_column("leads", sa.Column("accountant_name", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("leads", "accountant_name")
