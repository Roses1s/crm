"""Убрать старые одиночные поля города у заявки

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-10-01 13:00:00.000000+03:00

Города погрузки и выгрузки давно хранятся списком тегов (`loading_cities` /
`unloading_cities`). Одиночные `city_loading` / `city_unloading` остались от
первой версии заявки и больше нигде не заполняются — только подставлялись
в маршрут как запасной вариант.

Сначала ПЕРЕНОСИМ данные из старых колонок в списки (там, где список пуст, а
старое поле заполнено), и только потом удаляем колонки. Так ни один город из
уже заведённых заявок не потеряется.
"""

from __future__ import annotations

import json
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "f6a7b8c9d0e1"
down_revision: str | None = "e5f6a7b8c9d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    bind = op.get_bind()

    rows = bind.execute(
        sa.text(
            "SELECT id, city_loading, city_unloading, loading_cities, unloading_cities "
            "FROM shipments"
        )
    ).fetchall()

    for row in rows:
        updates: dict[str, str] = {}
        if _is_empty(row.loading_cities) and (row.city_loading or "").strip():
            updates["loading_cities"] = json.dumps([row.city_loading.strip()], ensure_ascii=False)
        if _is_empty(row.unloading_cities) and (row.city_unloading or "").strip():
            updates["unloading_cities"] = json.dumps(
                [row.city_unloading.strip()], ensure_ascii=False
            )
        for column, value in updates.items():
            bind.execute(
                sa.text(f"UPDATE shipments SET {column} = :value WHERE id = :id"),  # noqa: S608
                {"value": value, "id": row.id},
            )

    with op.batch_alter_table("shipments") as batch:
        batch.drop_column("city_loading")
        batch.drop_column("city_unloading")


def downgrade() -> None:
    # Возвращаем колонки пустыми: данные уже живут в списках городов.
    with op.batch_alter_table("shipments") as batch:
        batch.add_column(
            sa.Column("city_loading", sa.String(length=120), nullable=False, server_default="")
        )
        batch.add_column(
            sa.Column("city_unloading", sa.String(length=120), nullable=False, server_default="")
        )


def _is_empty(value: object) -> bool:
    """Пустой список городов — это NULL, пустая строка, '[]' или [] ."""
    if value is None:
        return True
    if isinstance(value, str):
        stripped = value.strip()
        return stripped in ("", "[]")
    if isinstance(value, list):
        return len(value) == 0
    return False
