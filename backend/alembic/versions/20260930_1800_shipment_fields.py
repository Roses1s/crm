"""Поля транспортной заявки: заказчик, погрузка/выгрузка, перевозчик, груз

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-09-30 18:00:00.000000+03:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: str | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Текстовые колонки NOT NULL с пустым значением по умолчанию.
_TEXT_COLUMNS = [
    ("customer_contact", 255),
    ("customer_signer", 255),
    ("loading_time_from", 40),
    ("loading_time_to", 40),
    ("unloading_time_from", 40),
    ("unloading_time_to", 40),
    ("carrier_contact", 255),
    ("vehicle", 120),
    ("vehicle_number", 40),
    ("trailer_number", 40),
    ("driver_name", 255),
    ("driver_phone", 40),
    ("driver_passport", 255),
    ("carrier_signer", 255),
    ("cargo_type", 255),
    ("cargo_packaging", 255),
    ("body_type", 120),
]

_JSON_COLUMNS = ["loading_cities", "unloading_cities", "loading_method"]
_DATE_COLUMNS = [
    "loading_date_from",
    "loading_date_to",
    "unloading_date_from",
    "unloading_date_to",
]


def upgrade() -> None:
    with op.batch_alter_table("shipments") as batch:
        batch.add_column(
            sa.Column("customer_address", sa.Text(), nullable=False, server_default="")
        )
        for name, length in _TEXT_COLUMNS:
            batch.add_column(
                sa.Column(name, sa.String(length=length), nullable=False, server_default="")
            )
        for name in _JSON_COLUMNS:
            batch.add_column(sa.Column(name, sa.JSON(), nullable=False, server_default="[]"))
        for name in _DATE_COLUMNS:
            batch.add_column(sa.Column(name, sa.Date(), nullable=True))
        batch.add_column(
            sa.Column("has_trailer", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch.add_column(sa.Column("capacity", sa.Numeric(10, 2), nullable=True))


def downgrade() -> None:
    columns = (
        ["customer_address", "has_trailer", "capacity"]
        + [name for name, _ in _TEXT_COLUMNS]
        + _JSON_COLUMNS
        + _DATE_COLUMNS
    )
    with op.batch_alter_table("shipments") as batch:
        for name in columns:
            batch.drop_column(name)
