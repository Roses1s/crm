"""Снять временные server default, оставшиеся после заполнения новых колонок

Revision ID: c5e93b9d1995
Revises: a7c9e2d4f681
Create Date: 2026-10-08 09:00:00.000000+05:00

Старые миграции задавали значения по умолчанию, чтобы заполнить уже существующие
строки при добавлении обязательных колонок. Приложение задаёт эти значения само;
постоянное значение по умолчанию на стороне БД здесь не требуется. Убираем
только такие временные значения. Дефолты времени из TimestampMixin остаются.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c5e93b9d1995"
down_revision: str | None = "a7c9e2d4f681"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Все поля из этой таблицы имеют только Python-default в моделях; SQL-default
# был нужен временно при миграциях, которые добавляли поля к старым строкам.
_TEMPORARY_DEFAULTS: dict[str, dict[str, str | sa.sql.elements.ClauseElement]] = {
    "shipments": {
        "customer_address": "",
        "customer_contact": "",
        "customer_signer": "",
        "loading_time_from": "",
        "loading_time_to": "",
        "unloading_time_from": "",
        "unloading_time_to": "",
        "carrier_contact": "",
        "vehicle": "",
        "vehicle_number": "",
        "trailer_number": "",
        "driver_name": "",
        "driver_phone": "",
        "driver_passport": "",
        "carrier_signer": "",
        "cargo_type": "",
        "cargo_packaging": "",
        "body_type": sa.text("'[]'"),
        "loading_cities": sa.text("'[]'"),
        "unloading_cities": sa.text("'[]'"),
        "loading_method": sa.text("'[]'"),
        "has_trailer": sa.false(),
        "customer_tax": "vat_22",
        "carrier_tax": "vat_22",
        "carrier_name": "",
        "carrier_inn": "",
    },
    "revoked_tokens": {"reason": "logout"},
}


def upgrade() -> None:
    # batch_alter_table генерирует ALTER COLUMN DROP DEFAULT в PostgreSQL, а на
    # SQLite пересобирает таблицу, поскольку SQLite не умеет менять default отдельно.
    for table, defaults in _TEMPORARY_DEFAULTS.items():
        with op.batch_alter_table(table) as batch:
            for column in defaults:
                batch.alter_column(column, server_default=None)


def downgrade() -> None:
    """При откате вернуть прежние дефолты, но не менять значения строк."""
    for table, defaults in _TEMPORARY_DEFAULTS.items():
        with op.batch_alter_table(table) as batch:
            for column, server_default in defaults.items():
                batch.alter_column(column, server_default=server_default)
