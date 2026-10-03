"""Причина отзыва обновляющего токена

Revision ID: c1d2e3f4a5b6
Revises: b4f7c9d2e6a1
Create Date: 2026-10-03 11:00:00.000000+03:00

При продлении сессии прежний обновляющий токен теперь сразу отзывается
(раньше он оставался рабочим все 14 дней — см. ревью от 03.10.2026, Б-07).
Но у вкладок бывает гонка: несколько запросов получают 401 одновременно и
продлевают сессию почти синхронно. Чтобы второй такой запрос не выбрасывал
человека на страницу входа, у отзыва «по ротации» есть короткое окно
снисхождения, а у отзыва «по выходу из системы» — нет.

Колонка добавляется со значением по умолчанию `logout`: уже записанные отзывы
сделаны именно при выходе, и для них снисхождения быть не должно.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | None = "b4f7c9d2e6a1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("revoked_tokens") as batch:
        batch.add_column(
            sa.Column("reason", sa.String(length=20), nullable=False, server_default="logout")
        )


def downgrade() -> None:
    with op.batch_alter_table("revoked_tokens") as batch:
        batch.drop_column("reason")
