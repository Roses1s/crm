"""Тип кузова заявки — список тегов (JSON) вместо строки

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-30 19:30:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: str | None = "c3d4e5f6a7b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Приводим существующие значения к валидному JSON-списку до смены типа:
    # пустые → [], непустую строку оборачиваем в ["…"].
    op.execute("UPDATE shipments SET body_type = '[]' WHERE body_type = '' OR body_type IS NULL")
    op.execute(
        "UPDATE shipments SET body_type = json_array(body_type) WHERE json_valid(body_type) = 0"
    )
    with op.batch_alter_table("shipments") as batch:
        batch.alter_column(
            "body_type",
            existing_type=sa.String(length=120),
            type_=sa.JSON(),
            existing_nullable=False,
            server_default="[]",
        )


def downgrade() -> None:
    # Обратно в строку: берём первый элемент списка (или пусто).
    with op.batch_alter_table("shipments") as batch:
        batch.alter_column(
            "body_type",
            existing_type=sa.JSON(),
            type_=sa.String(length=120),
            existing_nullable=False,
            server_default="",
        )
    op.execute("UPDATE shipments SET body_type = '' WHERE body_type = '[]' OR body_type IS NULL")
    op.execute(
        "UPDATE shipments SET body_type = json_extract(body_type, '$[0]') "
        "WHERE json_valid(body_type) = 1 AND json_array_length(body_type) > 0"
    )
