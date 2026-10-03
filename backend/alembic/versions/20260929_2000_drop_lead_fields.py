"""Убраны неиспользуемые поля лида: КПП, часовой пояс, лимит, даты звонков, контакты компании

Revision ID: 5e1a83c6d470
Revises: 7d90c4a1f5b8
Create Date: 2026-09-29 20:00:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "5e1a83c6d470"
down_revision: str | None = "7d90c4a1f5b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Владелец отказался от этих полей 29.09.2026 вместе с их содержимым.
_COLUMNS = [
    "kpp",
    "timezone",
    "company_email",
    "phone",
    "credit_limit",
    "first_call_date",
    "next_call_date",
]


def upgrade() -> None:
    with op.batch_alter_table("leads") as batch:
        for column in _COLUMNS:
            batch.drop_column(column)


def downgrade() -> None:
    # Колонки вернутся пустыми: удалённые значения восстановить нельзя.
    with op.batch_alter_table("leads") as batch:
        batch.add_column(sa.Column("kpp", sa.String(length=9), nullable=False, server_default=""))
        batch.add_column(
            sa.Column("timezone", sa.String(length=16), nullable=False, server_default="")
        )
        batch.add_column(sa.Column("company_email", sa.String(length=255), nullable=True))
        batch.add_column(
            sa.Column("phone", sa.String(length=32), nullable=False, server_default="")
        )
        batch.add_column(sa.Column("credit_limit", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("first_call_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("next_call_date", sa.Date(), nullable=True))
