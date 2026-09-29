"""Две роли вместо трёх: операторы становятся менеджерами

Revision ID: 8f31ac04b1de
Revises: 195c9504ee7d
Create Date: 2026-09-29 14:00:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "8f31ac04b1de"
down_revision: str | None = "195c9504ee7d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Роль хранится как VARCHAR + CHECK (native_enum=False), поэтому смена набора
# значений — это обновление строк и пересоздание ограничения, без ALTER TYPE.
_SHORT = "role"

# Имя ограничения в боевой базе может отличаться от ожидаемого: его давал
# SQLAlchemy при создании таблицы. Попытка удалить его по угаданному имени
# уже один раз уронила деплой, поэтому имя ищем в системном каталоге.
_FIND_CHECK = sa.text("""
    SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
     WHERE rel.relname = 'users'
       AND con.contype = 'c'
       AND strpos(pg_get_constraintdef(con.oid), 'role') > 0
     LIMIT 1
""")


def _drop_role_check() -> None:
    """Снимает действующую проверку списка ролей, как бы она ни называлась."""
    bind = op.get_bind()
    name = bind.execute(_FIND_CHECK).scalar()
    if name:
        # Имя пришло из системного каталога, кавычки защищают от регистра.
        op.execute(f'ALTER TABLE users DROP CONSTRAINT "{name}"')


def upgrade() -> None:
    op.execute("UPDATE users SET role = 'manager' WHERE role = 'operator'")

    # SQLite не отражает CHECK-ограничения, пересоздать их миграцией нельзя.
    # Для локальной базы это не важно: она создаётся из моделей, где роли уже
    # две. В продакшене (PostgreSQL) ограничение обновляем честно.
    if op.get_bind().dialect.name != "sqlite":
        _drop_role_check()
        op.create_check_constraint(_SHORT, "users", sa.text("role IN ('admin', 'manager')"))


def downgrade() -> None:
    # Вернуть операторов невозможно — кто ими был, уже неизвестно;
    # восстанавливаем только допустимый набор значений.
    if op.get_bind().dialect.name != "sqlite":
        _drop_role_check()
        op.create_check_constraint(
            _SHORT, "users", sa.text("role IN ('admin', 'manager', 'operator')")
        )
