"""Целостность лида у заявки, её истории и вложений

Revision ID: b4f7c9d2e6a1
Revises: 97a47d928571
Create Date: 2026-10-02 18:30:00.000000+03:00

`lead_id` у timeline_entries/attachments заявки денормализован: он нужен для
авторизации, подсчёта места и каскадного удаления. Раньше обычный PATCH менял
только shipments.lead_id, поэтому дочерние строки могли остаться у прежнего
лида. Удаление прежнего лида тогда уничтожало историю и файлы уже перенесённой
заявки.

Перед добавлением ограничений миграция сначала переносит существующие дочерние
строки к фактическому лиду их заявки и проверяет, что расхождений не осталось.
Строки и файлы не удаляются. Составные внешние ключи затем не дают снова
создать такое состояние. Они отложенные до COMMIT, чтобы три таблицы можно
было атомарно обновить внутри одной транзакции.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.sql.selectable import TableClause

from alembic import op

revision: str = "b4f7c9d2e6a1"
down_revision: str | None = "97a47d928571"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

log = logging.getLogger("alembic.runtime.migration")

shipments = sa.table("shipments", sa.column("id", sa.Integer()), sa.column("lead_id", sa.Integer()))
timeline_entries = sa.table(
    "timeline_entries",
    sa.column("shipment_id", sa.Integer()),
    sa.column("lead_id", sa.Integer()),
)
attachments = sa.table(
    "attachments",
    sa.column("shipment_id", sa.Integer()),
    sa.column("lead_id", sa.Integer()),
)


def _mismatch_count(child: TableClause) -> int:
    """Считает дочерние строки, чей lead_id не совпадает с заявкой."""
    stmt = (
        sa.select(sa.func.count())
        .select_from(child.join(shipments, shipments.c.id == child.c.shipment_id))
        .where(
            child.c.shipment_id.is_not(None),
            child.c.lead_id != shipments.c.lead_id,
        )
    )
    return int(op.get_bind().execute(stmt).scalar_one())


def _repair_lead_ids(child: TableClause) -> tuple[int, int]:
    """Переносит lead_id к фактическому лиду заявки и перепроверяет результат."""
    before = _mismatch_count(child)
    if before:
        target_lead_id = (
            sa.select(shipments.c.lead_id)
            .where(shipments.c.id == child.c.shipment_id)
            .scalar_subquery()
        )
        op.execute(
            child.update()
            .where(
                child.c.shipment_id.is_not(None),
                child.c.lead_id != target_lead_id,
            )
            .values(lead_id=target_lead_id)
        )
    after = _mismatch_count(child)
    if after:
        raise RuntimeError(f"После переноса осталось {after} несогласованных строк в {child.name}")
    log.info("Проверка %s: исправлено строк — %s, осталось — 0", child.name, before)
    return before, after


def upgrade() -> None:
    # Сначала данные, затем ограничения: миграция не пытается скрыть старое
    # расхождение и явно упадёт, если перенос почему-либо не завершился.
    _repair_lead_ids(timeline_entries)
    _repair_lead_ids(attachments)

    with op.batch_alter_table("shipments") as batch:
        batch.create_unique_constraint("uq_shipments_id_lead_id", ["id", "lead_id"])

    with op.batch_alter_table("timeline_entries") as batch:
        batch.drop_constraint("fk_timeline_entries_shipment_id_shipments", type_="foreignkey")
        batch.create_foreign_key(
            "fk_timeline_entries_shipment_lead_shipments",
            "shipments",
            ["shipment_id", "lead_id"],
            ["id", "lead_id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        )

    with op.batch_alter_table("attachments") as batch:
        batch.drop_constraint("fk_attachments_shipment_id_shipments", type_="foreignkey")
        batch.create_foreign_key(
            "fk_attachments_shipment_lead_shipments",
            "shipments",
            ["shipment_id", "lead_id"],
            ["id", "lead_id"],
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        )


def downgrade() -> None:
    # Исправленные lead_id намеренно не портим обратно: downgrade возвращает
    # только прежнюю схему, а восстановление некорректных связей было бы
    # необратимой потерей уже исправленной информации.
    with op.batch_alter_table("attachments") as batch:
        batch.drop_constraint("fk_attachments_shipment_lead_shipments", type_="foreignkey")
        batch.create_foreign_key(
            "fk_attachments_shipment_id_shipments",
            "shipments",
            ["shipment_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table("timeline_entries") as batch:
        batch.drop_constraint("fk_timeline_entries_shipment_lead_shipments", type_="foreignkey")
        batch.create_foreign_key(
            "fk_timeline_entries_shipment_id_shipments",
            "shipments",
            ["shipment_id"],
            ["id"],
            ondelete="CASCADE",
        )

    with op.batch_alter_table("shipments") as batch:
        batch.drop_constraint("uq_shipments_id_lead_id", type_="unique")
