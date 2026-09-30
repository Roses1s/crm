"""Тип кузова заявки — список тегов (JSON) вместо строки

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-30 19:30:00.000000+03:00

Колонка body_type добавлена предыдущей ревизией как строка и в реальных данных
содержит либо пустую строку, либо уже валидный JSON-массив (его пишет текущий
код). Поэтому достаточно пустые значения превратить в '[]' и сменить тип на JSON.
Делаем это отдельно для PostgreSQL (прод) и SQLite (CI/локально), потому что
синтаксис смены типа и приведения различается.
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
    dialect = op.get_bind().dialect.name

    # Пустые значения -> валидный JSON-список, иначе приведение к JSON упадёт.
    op.execute("UPDATE shipments SET body_type = '[]' WHERE body_type IS NULL OR body_type = ''")

    if dialect == "postgresql":
        # Сначала снимаем старый DEFAULT '' (иначе смена типа попытается
        # привести ''::json и упадёт), затем меняем тип и ставим новый дефолт.
        op.execute("ALTER TABLE shipments ALTER COLUMN body_type DROP DEFAULT")
        op.execute("ALTER TABLE shipments ALTER COLUMN body_type TYPE json USING body_type::json")
        op.execute("ALTER TABLE shipments ALTER COLUMN body_type SET DEFAULT '[]'")
    else:
        with op.batch_alter_table("shipments") as batch:
            batch.alter_column(
                "body_type",
                existing_type=sa.String(length=120),
                type_=sa.JSON(),
                existing_nullable=False,
                server_default=sa.text("'[]'"),
            )


def downgrade() -> None:
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.execute("ALTER TABLE shipments ALTER COLUMN body_type DROP DEFAULT")
        op.execute(
            "ALTER TABLE shipments ALTER COLUMN body_type TYPE varchar(120) USING body_type::text"
        )
        op.execute("ALTER TABLE shipments ALTER COLUMN body_type SET DEFAULT ''")
    else:
        with op.batch_alter_table("shipments") as batch:
            batch.alter_column(
                "body_type",
                existing_type=sa.JSON(),
                type_=sa.String(length=120),
                existing_nullable=False,
                server_default="",
            )

    op.execute("UPDATE shipments SET body_type = '' WHERE body_type = '[]' OR body_type IS NULL")
