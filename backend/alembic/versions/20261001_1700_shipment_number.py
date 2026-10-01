"""Номер заявки — редактируемое поле

Revision ID: ebb7a6f2080f
Revises: e9bb285e2875
Create Date: 2026-10-01 17:00:00.000000+03:00

Раньше в заголовке заявки показывалось название лида, а «номером» в списке
служил просто id — его нельзя переименовать. Теперь у заявки есть отдельное
текстовое поле `number`: по умолчанию равно id (бэкфилл ниже), но пользователь
может переименовать его во что угодно.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "ebb7a6f2080f"
down_revision: str | None = "e9bb285e2875"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("shipments", sa.Column("number", sa.String(length=40), nullable=True))

    shipments = sa.table(
        "shipments", sa.column("id", sa.Integer()), sa.column("number", sa.String())
    )
    op.execute(shipments.update().values(number=sa.cast(shipments.c.id, sa.String(length=40))))

    with op.batch_alter_table("shipments", schema=None) as batch_op:
        batch_op.alter_column("number", existing_type=sa.String(length=40), nullable=False)
        batch_op.create_index(batch_op.f("ix_shipments_number"), ["number"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("shipments", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_shipments_number"))
        batch_op.drop_column("number")
