"""Сделать номер заявки уникальным.

Revision ID: a7c9e2d4f681
Revises: f4a5b6c7d8e9
Create Date: 2026-10-07 22:00:00.000000+05:00

Перед этим изменением владелец проверил копию резервной базы: в 11 заявках
повторяющихся номеров не найдено. Перед ограничением повторно проверяем целевую
базу, чтобы миграция остановилась без изменений, если после создания копии
появились новые дубли. Номера автоматически не исправляются.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7c9e2d4f681"
down_revision: str | None = "f4a5b6c7d8e9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    connection = op.get_bind()
    duplicate_groups = connection.execute(
        sa.text(
            """
            SELECT count(*)
            FROM (
                SELECT number
                FROM shipments
                GROUP BY number
                HAVING count(*) > 1
            ) AS duplicate_numbers
            """
        )
    ).scalar_one()
    if duplicate_groups:
        raise RuntimeError(
            "Нельзя сделать номер заявки уникальным: "
            f"в базе найдено повторяющихся номеров: {duplicate_groups}. "
            "Номера не менялись; сначала проверьте копию данных."
        )

    # Убираем старый обычный индекс и заменяем его ограничением уникальности.
    with op.batch_alter_table("shipments", schema=None) as batch_op:
        batch_op.drop_index("ix_shipments_number")
        batch_op.create_unique_constraint("uq_shipments_number", ["number"])


def downgrade() -> None:
    with op.batch_alter_table("shipments", schema=None) as batch_op:
        batch_op.drop_constraint("uq_shipments_number", type_="unique")
        batch_op.create_index("ix_shipments_number", ["number"], unique=False)
