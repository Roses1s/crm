"""Личные доски: у этапа появляется владелец

Revision ID: c47d1f0a9b22
Revises: 8f31ac04b1de
Create Date: 2026-09-29 14:20:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c47d1f0a9b22"
down_revision: str | None = "8f31ac04b1de"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Внешний ключ объявляем прямо в колонке: отдельный ALTER ... ADD CONSTRAINT
    # SQLite не умеет, а так миграция одинаково проходит на обеих базах.
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("stages") as batch:
            batch.add_column(
                sa.Column(
                    "owner_id",
                    sa.Integer(),
                    sa.ForeignKey("users.id", name="fk_stages_owner_id_users", ondelete="CASCADE"),
                    nullable=True,
                )
            )
    else:
        op.add_column("stages", sa.Column("owner_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            "fk_stages_owner_id_users", "stages", "users", ["owner_id"], ["id"], ondelete="CASCADE"
        )
    op.create_index("ix_stages_owner_id", "stages", ["owner_id"], unique=False)

    # Этапы прежней общей воронки отдаём первому администратору: его доска
    # становится продолжением того, что было, а у остальных наборы создаются
    # при первом входе.
    op.execute(
        "UPDATE stages SET owner_id = ("
        "SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1"
        ") WHERE owner_id IS NULL"
    )


def downgrade() -> None:
    op.drop_index("ix_stages_owner_id", table_name="stages")
    if op.get_bind().dialect.name == "sqlite":
        with op.batch_alter_table("stages") as batch:
            batch.drop_column("owner_id")
    else:
        op.drop_constraint("fk_stages_owner_id_users", "stages", type_="foreignkey")
        op.drop_column("stages", "owner_id")
