"""Создать редактируемый справочник бухгалтеров.

Revision ID: d8e9f0a1b2c3
Revises: c5e93b9d1995
Create Date: 2026-10-14 12:00:00.000000+05:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d8e9f0a1b2c3"
down_revision: str | None = "c5e93b9d1995"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_INITIAL_ACCOUNTANTS = (
    "Пухова Елена Витальевна",
    "Кузьмина Виктория Павловна",
    "Белякова Ольга Александровна",
    "Терентьева Елена Александровна",
    "Горнагина Ирина Анатольевна",
    "Дремова Наталья Александровна",
    "Позднякова Лилия Усманова",
    "Рыбина Екатерина",
    "Гуцол Катерина Евгеньевна",
    "Колясникова Алина",
)


def upgrade() -> None:
    op.create_table(
        "accountants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_accountants")),
        sa.UniqueConstraint("name", name="uq_accountants_name"),
    )
    accountants = sa.table(
        "accountants",
        sa.column("name", sa.String(length=255)),
        sa.column("is_active", sa.Boolean()),
    )
    op.bulk_insert(
        accountants,
        [{"name": name, "is_active": True} for name in _INITIAL_ACCOUNTANTS],
    )


def downgrade() -> None:
    op.drop_table("accountants")
