"""Лента чаттера для заявки: колонка shipment_id в timeline_entries

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-30 17:30:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("timeline_entries") as batch:
        batch.add_column(sa.Column("shipment_id", sa.Integer(), nullable=True))
        batch.create_index(
            op.f("ix_timeline_entries_shipment_id"), ["shipment_id"], unique=False
        )
        batch.create_foreign_key(
            op.f("fk_timeline_entries_shipment_id_shipments"),
            "shipments",
            ["shipment_id"],
            ["id"],
            ondelete="CASCADE",
        )


def downgrade() -> None:
    with op.batch_alter_table("timeline_entries") as batch:
        batch.drop_constraint(
            op.f("fk_timeline_entries_shipment_id_shipments"), type_="foreignkey"
        )
        batch.drop_index(op.f("ix_timeline_entries_shipment_id"))
        batch.drop_column("shipment_id")
