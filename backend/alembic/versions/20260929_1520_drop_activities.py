"""Активности убраны из CRM: таблица и записи в ленте удаляются

Revision ID: 2b6c19f7e401
Revises: c47d1f0a9b22
Create Date: 2026-09-29 15:20:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "2b6c19f7e401"
down_revision: str | None = "c47d1f0a9b22"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Имя CHECK-ограничения в боевой базе может отличаться от ожидаемого — ищем его
# в системном каталоге (см. раздел 9 docs/PROJECT.md, грабли с ролями).
_FIND_TYPE_CHECK = sa.text("""
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'timeline_entries'
       AND con.contype = 'c'
       AND strpos(pg_get_constraintdef(con.oid), 'activity') > 0
     LIMIT 1
""")


def upgrade() -> None:
    # Владелец отказался от активностей 29.09.2026 вместе с их историей.
    op.execute("DELETE FROM timeline_entries WHERE type = 'activity'")
    op.drop_table("activities")

    if op.get_bind().dialect.name != "sqlite":
        name = op.get_bind().execute(_FIND_TYPE_CHECK).scalar()
        if name:
            op.execute(f'ALTER TABLE timeline_entries DROP CONSTRAINT "{name}"')
        op.create_check_constraint(
            "type",
            "timeline_entries",
            sa.text("type IN ('note', 'history', 'message')"),
        )


def downgrade() -> None:
    # Таблица воссоздаётся пустой: удалённые действия восстановить нельзя.
    op.create_table(
        "activities",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("lead_id", sa.Integer(), nullable=False),
        sa.Column("assigned_to_id", sa.Integer(), nullable=True),
        sa.Column(
            "type",
            sa.Enum("call", "meeting", "todo", "email", name="activitytype", native_enum=False),
            nullable=False,
        ),
        sa.Column("summary", sa.String(length=255), nullable=False),
        sa.Column("note", sa.Text(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("is_done", sa.Boolean(), nullable=False),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["lead_id"], ["leads.id"], name="fk_activities_lead_id_leads", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["assigned_to_id"],
            ["users.id"],
            name="fk_activities_assigned_to_id_users",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_activities"),
    )
    op.create_index("ix_activities_lead_id", "activities", ["lead_id"])
    op.create_index("ix_activities_assigned_to_id", "activities", ["assigned_to_id"])
    op.create_index("ix_activities_due_date", "activities", ["due_date"])
    op.create_index("ix_activities_is_done", "activities", ["is_done"])
