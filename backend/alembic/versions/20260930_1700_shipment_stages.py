"""Этапы заявки вместо прежних статусов: Новая / Проверена и подписана / Загрузилась / Выгрузилась

Revision ID: a1b2c3d4e5f6
Revises: 5e1a83c6d470
Create Date: 2026-09-30 17:00:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | None = "5e1a83c6d470"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Старый статус -> новый этап. Колонка status — обычный VARCHAR без CHECK,
# поэтому достаточно переложить значения данными, без изменения схемы.
_FORWARD = {
    "in_progress": "checked",
    "in_transit": "loaded",
    "delivered": "unloaded",
    # У «Отменена» нет нового аналога — возвращаем в начало воронки.
    "cancelled": "new",
}

# Обратное соответствие для отката (приблизительное, один-к-одному невозможно).
_BACKWARD = {
    "checked": "in_progress",
    "loaded": "in_transit",
    "unloaded": "delivered",
}


def _remap(mapping: dict[str, str]) -> None:
    shipments = sa.table("shipments", sa.column("status", sa.String))
    for old, new in mapping.items():
        op.execute(
            shipments.update()
            .where(shipments.c.status == op.inline_literal(old))
            .values(status=op.inline_literal(new))
        )


def upgrade() -> None:
    _remap(_FORWARD)


def downgrade() -> None:
    _remap(_BACKWARD)
