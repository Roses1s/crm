"""Справочник перевозчиков заменён на свободный текст в заявке

Revision ID: 97a47d928571
Revises: ebb7a6f2080f
Create Date: 2026-10-02 09:00:00.000000+03:00

Перевозчик больше не отдельная сущность с админской вкладкой, а обычные
текстовые поля прямо в заявке: компания, ИНН и контакт. Продавец вписывает
любого перевозчика при создании заявки, не выбирая его из общего списка.
Никакой проверки на пересечение/дубли между заявками для этих полей не
вводится — только контрольная сумма ИНН, если он указан.

По решению владельца продукта старые данные (таблицы `carriers`,
`carrier_tags`, колонка `shipments.carrier_id`) переносить некуда и не нужно —
просто удаляются вместе со старым механизмом.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "97a47d928571"
down_revision: str | None = "ebb7a6f2080f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_table("carrier_tags")

    with op.batch_alter_table("shipments") as batch:
        # Индекс и внешний ключ на колонке явно убираем ДО её удаления: иначе
        # batch-режим Alembic (пересоздание таблицы на SQLite) попытается
        # воссоздать индекс на уже отсутствующей колонке и упадёт.
        batch.drop_index("ix_shipments_carrier_id")
        batch.drop_constraint("fk_shipments_carrier_id_carriers", type_="foreignkey")
        batch.drop_column("carrier_id")
        batch.add_column(
            sa.Column("carrier_name", sa.String(length=255), nullable=False, server_default="")
        )
        batch.add_column(
            sa.Column("carrier_inn", sa.String(length=12), nullable=False, server_default="")
        )

    op.drop_index(op.f("ix_carriers_name"), table_name="carriers")
    op.drop_table("carriers")


def downgrade() -> None:
    op.create_table(
        "carriers",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("inn", sa.String(length=12), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_carriers")),
    )
    op.create_index(op.f("ix_carriers_name"), "carriers", ["name"], unique=False)

    with op.batch_alter_table("shipments") as batch:
        batch.drop_column("carrier_inn")
        batch.drop_column("carrier_name")
        batch.add_column(sa.Column("carrier_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            op.f("fk_shipments_carrier_id_carriers"),
            "carriers",
            ["carrier_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_index(
            op.f("ix_shipments_carrier_id"), ["carrier_id"], unique=False
        )

    op.create_table(
        "carrier_tags",
        sa.Column("carrier_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["carrier_id"],
            ["carriers.id"],
            name=op.f("fk_carrier_tags_carrier_id_carriers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], name=op.f("fk_carrier_tags_tag_id_tags"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("carrier_id", "tag_id", name=op.f("pk_carrier_tags")),
    )
