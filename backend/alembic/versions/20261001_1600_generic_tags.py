"""Теги теперь не только у лидов: перевозчики и заявки, свободный цвет

Revision ID: e9bb285e2875
Revises: 66c922a4a2c0
Create Date: 2026-10-01 16:00:00.000000+03:00

Раньше тег можно было повесить только на лид, цвет выбирался из шести
заготовленных имён (blue/green/...), а создавать теги мог только админ.
Теперь: тег можно прицепить и к перевозчику, и к заявке; цвет — произвольный
HEX; создавать/красить/удалять может любой сотрудник (см. app/api/v1/tags.py).

Старые именованные цвета переводим в их текущие HEX-эквиваленты (см.
frontend/src/shared/ui/tag-styles.ts) — ничего не перекрашивается визуально.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "e9bb285e2875"
down_revision: str | None = "66c922a4a2c0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Старое имя -> HEX, посчитанный из насыщенного ("текстового") оттенка той же
# палитры, что уже была в frontend/src/index.css.
_LEGACY_COLORS = {
    "blue": "#1a5276",
    "green": "#1e8449",
    "red": "#922b21",
    "yellow": "#7d6608",
    "purple": "#6c3483",
    "orange": "#935116",
}


def upgrade() -> None:
    op.create_table(
        "carrier_tags",
        sa.Column("carrier_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["carrier_id"],
            ["carriers.id"],
            name=op.f("fk_carrier_tags_carrier_id_carriers"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], name=op.f("fk_carrier_tags_tag_id_tags"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("carrier_id", "tag_id", name=op.f("pk_carrier_tags")),
    )
    op.create_table(
        "shipment_tags",
        sa.Column("shipment_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["shipment_id"],
            ["shipments.id"],
            name=op.f("fk_shipment_tags_shipment_id_shipments"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tag_id"], ["tags.id"], name=op.f("fk_shipment_tags_tag_id_tags"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("shipment_id", "tag_id", name=op.f("pk_shipment_tags")),
    )

    tags = sa.table("tags", sa.column("id", sa.Integer()), sa.column("color", sa.String()))
    for name, hex_color in _LEGACY_COLORS.items():
        op.execute(tags.update().where(tags.c.color == name).values(color=hex_color))


def downgrade() -> None:
    tags = sa.table("tags", sa.column("id", sa.Integer()), sa.column("color", sa.String()))
    for name, hex_color in _LEGACY_COLORS.items():
        op.execute(tags.update().where(tags.c.color == hex_color).values(color=name))

    op.drop_table("shipment_tags")
    op.drop_table("carrier_tags")
