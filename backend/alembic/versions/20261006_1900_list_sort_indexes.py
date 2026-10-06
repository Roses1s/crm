"""Индексы под сортировку списков (М-03 ревью 06.10)

Список заявок сортируется по shipments.created_at, списки лидов и клиентов —
по leads.updated_at. Без индекс база сортирует всю таблицу при каждом
открытии страницы — с ростом данных это линейное замедление.

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-10-06 19:00:00.000000+05:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "e3f4a5b6c7d8"
down_revision: str | None = "d2e3f4a5b6c7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index("ix_shipments_created_at", "shipments", ["created_at"], unique=False)
    op.create_index("ix_leads_updated_at", "leads", ["updated_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_leads_updated_at", table_name="leads")
    op.drop_index("ix_shipments_created_at", table_name="shipments")
