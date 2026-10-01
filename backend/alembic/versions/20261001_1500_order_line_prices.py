"""Позиция заказа: цена заказчика/перевозчика со своей ставкой НДС

Revision ID: 66c922a4a2c0
Revises: a7b8c9d0e1f2
Create Date: 2026-10-01 15:00:00.000000+03:00

Вкладка «Позиции заказа» у заявки раньше была заглушкой. Строка одна —
фиксированное транспортно-экспедиционное обслуживание, цена нужна в двух
разрезах (сколько платит заказчик и сколько получает перевозчик), и у
каждой своя ставка НДС.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "66c922a4a2c0"
down_revision: str | None = "a7b8c9d0e1f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_TAX_RATE = sa.Enum(
    "vat_22", "no_vat", "vat_0", name="taxrate", native_enum=False, length=20
)


def upgrade() -> None:
    with op.batch_alter_table("shipments") as batch:
        batch.add_column(sa.Column("customer_price", sa.Numeric(12, 2), nullable=True))
        batch.add_column(
            sa.Column("customer_tax", _TAX_RATE, nullable=False, server_default="vat_22")
        )
        batch.add_column(sa.Column("carrier_price", sa.Numeric(12, 2), nullable=True))
        batch.add_column(
            sa.Column("carrier_tax", _TAX_RATE, nullable=False, server_default="vat_22")
        )


def downgrade() -> None:
    with op.batch_alter_table("shipments") as batch:
        batch.drop_column("carrier_tax")
        batch.drop_column("carrier_price")
        batch.drop_column("customer_tax")
        batch.drop_column("customer_price")
