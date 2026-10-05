"""Убрать неиспользуемую колонку stages.is_closed

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-10-03 18:00:00.000000+03:00

Поле осталось от общей воронки, где этап «Выиграно» помечался закрытым. После
перехода на личные доски (29.09.2026) его никто не читает: ни бэкенд, ни
интерфейс. Разбор мёртвого кода 03.10.2026 подтвердил это отдельной проверкой,
владелец согласовал удаление.

Данные не теряются в смысле бизнес-логики: флаг нигде не влиял на поведение.
Откат возвращает колонку со значением `false` у всех этапов.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "d2e3f4a5b6c7"
down_revision: str | None = "c1d2e3f4a5b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("stages") as batch:
        batch.drop_column("is_closed")


def downgrade() -> None:
    with op.batch_alter_table("stages") as batch:
        batch.add_column(
            sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.false())
        )
