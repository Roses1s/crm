"""Причины проигрыша лида

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-10-01 14:00:00.000000+03:00

Переосмысление архивации: «Архивировать» становится «Отметить проигрышем».
Причина проигрыша — отдельный маленький справочник (как теги), чтобы список
можно было менять без релиза. Четыре причины ниже — стартовый набор,
согласованный с владельцем 01.10.2026.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "a7b8c9d0e1f2"
down_revision: str | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

DEFAULT_REASONS = [
    "Перестал возить",
    "Отказ СБ",
    "Отказался работать",
    "далбич",
]


def upgrade() -> None:
    op.create_table(
        "loss_reasons",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    bind = op.get_bind()
    for name in DEFAULT_REASONS:
        bind.execute(sa.text("INSERT INTO loss_reasons (name) VALUES (:name)"), {"name": name})

    with op.batch_alter_table("leads") as batch:
        batch.add_column(sa.Column("loss_reason_id", sa.Integer(), nullable=True))
        batch.create_index(
            op.f("ix_leads_loss_reason_id"), ["loss_reason_id"], unique=False
        )
        batch.create_foreign_key(
            "fk_leads_loss_reason_id_loss_reasons",
            "loss_reasons",
            ["loss_reason_id"],
            ["id"],
            ondelete="SET NULL",
        )


def downgrade() -> None:
    with op.batch_alter_table("leads") as batch:
        batch.drop_constraint("fk_leads_loss_reason_id_loss_reasons", type_="foreignkey")
        batch.drop_index(op.f("ix_leads_loss_reason_id"))
        batch.drop_column("loss_reason_id")

    op.drop_table("loss_reasons")
