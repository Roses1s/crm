"""Вложения к заявкам: связь файла с заявкой на перевозку

Revision ID: 195c9504ee7d
Revises: 5c2628794daf
Create Date: 2026-09-29 12:48:23.544566+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = "195c9504ee7d"
down_revision: str | None = "5c2628794daf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Postgres умеет обычный ALTER TABLE ... ADD CONSTRAINT, SQLite — нет
    # (там ограничения меняются только пересозданием таблицы). Продакшен
    # на Postgres получает прямые операции, тестовая база на SQLite — batch.
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("attachments") as batch:
            batch.add_column(
                sa.Column(
                    "shipment_id",
                    sa.Integer(),
                    sa.ForeignKey(
                        "shipments.id",
                        name="fk_attachments_shipment_id_shipments",
                        ondelete="CASCADE",
                    ),
                    nullable=True,
                )
            )
    else:
        op.add_column("attachments", sa.Column("shipment_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_attachments_shipment_id_shipments",
            "attachments",
            "shipments",
            ["shipment_id"],
            ["id"],
            ondelete="CASCADE",
        )
    op.create_index("ix_attachments_shipment_id", "attachments", ["shipment_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_attachments_shipment_id", table_name="attachments")
    if op.get_bind().dialect.name == "sqlite":
        # В SQLite внешний ключ исчезает вместе с колонкой при пересоздании.
        with op.batch_alter_table("attachments") as batch:
            batch.drop_column("shipment_id")
    else:
        op.drop_constraint(
            "fk_attachments_shipment_id_shipments", "attachments", type_="foreignkey"
        )
        op.drop_column("attachments", "shipment_id")
