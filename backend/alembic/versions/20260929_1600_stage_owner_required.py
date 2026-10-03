"""Владелец этапа становится обязательным

Revision ID: 7d90c4a1f5b8
Revises: 2b6c19f7e401
Create Date: 2026-09-29 16:00:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "7d90c4a1f5b8"
down_revision: str | None = "2b6c19f7e401"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Страховка: если после перехода на личные доски остались «ничьи» этапы,
    # отдаём их первому администратору, иначе NOT NULL не применится.
    op.execute(
        "UPDATE stages SET owner_id = ("
        "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
        ") WHERE owner_id IS NULL"
    )
    # Этапы без владельца и без админа в базе бессмысленны — удаляем.
    op.execute("DELETE FROM stages WHERE owner_id IS NULL")

    with op.batch_alter_table("stages") as batch:
        batch.alter_column("owner_id", existing_type=sa.Integer(), nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("stages") as batch:
        batch.alter_column("owner_id", existing_type=sa.Integer(), nullable=True)
