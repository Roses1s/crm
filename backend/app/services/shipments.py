"""Бизнес-логика заявок на перевозку: доступ, список, статусы, лента."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.core.pagination import PageParams, build_page, paginate
from app.models.crm import Lead
from app.models.shipment import Shipment, ShipmentStatus
from app.models.timeline import EntryType, TimelineEntry
from app.models.user import Role, User
from app.schemas.crm import NoteCreate, NoteUpdate
from app.schemas.shipment import ShipmentCreate, ShipmentStatusUpdate, ShipmentUpdate
from app.services.leads import get_lead_or_404

log = get_logger(__name__)

# Русские подписи этапов для записи в ленту при смене этапа.
STAGE_LABELS: dict[ShipmentStatus, str] = {
    ShipmentStatus.new: "Новая",
    ShipmentStatus.checked: "Проверена и подписана заявка",
    ShipmentStatus.loaded: "Машина загрузилась",
    ShipmentStatus.unloaded: "Машина выгрузилась",
}


# --- доступ -----------------------------------------------------------------


async def get_shipment_or_404(
    session: AsyncSession, shipment_id: int, user: User | None = None
) -> Shipment:
    shipment = await session.get(Shipment, shipment_id)
    if shipment is None:
        raise NotFoundError(f"Заявка {shipment_id} не найдена")
    # Заявка наследует видимость своего лида: чужая для менеджера не существует.
    if user is not None and user.role != Role.admin:
        await get_lead_or_404(session, shipment.lead_id, user)
    return shipment


def visible_shipments(stmt: Any, user: User) -> Any:
    """Менеджеру показываем только заявки по его лидам."""
    if user.role == Role.admin:
        return stmt
    return stmt.where(Shipment.lead_id.in_(select(Lead.id).where(Lead.assigned_to_id == user.id)))


# --- операции над заявками --------------------------------------------------


async def list_shipments(
    session: AsyncSession,
    user: User,
    params: PageParams,
    *,
    status_filter: ShipmentStatus | None = None,
) -> dict[str, Any]:
    stmt = visible_shipments(select(Shipment).order_by(Shipment.created_at.desc()), user)
    if status_filter is not None:
        stmt = stmt.where(Shipment.status == status_filter)
    items, total = await paginate(session, stmt, params)
    return build_page(items, total, params)


async def create_shipment(session: AsyncSession, user: User, payload: ShipmentCreate) -> Shipment:
    # Заявку можно завести только по своему лиду.
    await get_lead_or_404(session, payload.lead_id, user)
    shipment = Shipment(**payload.model_dump())
    session.add(shipment)
    await session.commit()
    await session.refresh(shipment)
    log.info("shipment.created", shipment_id=shipment.id, by=user.id)
    return shipment


async def update_shipment(
    session: AsyncSession, user: User, shipment_id: int, payload: ShipmentUpdate
) -> Shipment:
    shipment = await get_shipment_or_404(session, shipment_id, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(shipment, key, value)
    await session.commit()
    await session.refresh(shipment)
    return shipment


async def set_status(
    session: AsyncSession, user: User, shipment_id: int, payload: ShipmentStatusUpdate
) -> Shipment:
    shipment = await get_shipment_or_404(session, shipment_id, user)
    previous = shipment.status
    shipment.status = payload.status
    if previous != payload.status:
        # Смена этапа попадает в ленту заявки — как история этапов у лида.
        session.add(
            TimelineEntry(
                lead_id=shipment.lead_id,
                shipment_id=shipment.id,
                author_id=user.id,
                type=EntryType.history,
                field_label="Этап",
                old_value=STAGE_LABELS.get(previous, previous.value),
                new_value=STAGE_LABELS.get(payload.status, payload.status.value),
            )
        )
    await session.commit()
    await session.refresh(shipment)
    log.info("shipment.status", shipment_id=shipment_id, status=payload.status.value, by=user.id)
    return shipment


async def lead_shipments(session: AsyncSession, user: User, lead_id: int) -> list[Shipment]:
    await get_lead_or_404(session, lead_id, user)
    stmt = select(Shipment).where(Shipment.lead_id == lead_id).order_by(Shipment.created_at.desc())
    return list((await session.execute(stmt)).unique().scalars().all())


# --- лента чаттера заявки ---------------------------------------------------


async def _get_entry_or_404(
    session: AsyncSession, shipment_id: int, entry_id: int
) -> TimelineEntry:
    entry = await session.get(TimelineEntry, entry_id)
    if entry is None or entry.shipment_id != shipment_id:
        raise NotFoundError(f"Запись {entry_id} не найдена")
    return entry


async def shipment_timeline(
    session: AsyncSession, user: User, shipment_id: int
) -> list[TimelineEntry]:
    await get_shipment_or_404(session, shipment_id, user)
    stmt = (
        select(TimelineEntry)
        .where(TimelineEntry.shipment_id == shipment_id)
        .order_by(TimelineEntry.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


async def add_note(
    session: AsyncSession, user: User, shipment_id: int, payload: NoteCreate
) -> TimelineEntry:
    shipment = await get_shipment_or_404(session, shipment_id, user)
    entry = TimelineEntry(
        lead_id=shipment.lead_id,
        shipment_id=shipment.id,
        author_id=user.id,
        type=EntryType.note,
        body=payload.body,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def update_entry(
    session: AsyncSession, user: User, shipment_id: int, entry_id: int, payload: NoteUpdate
) -> TimelineEntry:
    await get_shipment_or_404(session, shipment_id, user)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    if entry.type is not EntryType.note:
        raise AppError("Изменять можно только примечания", code="not_editable")
    entry.body = payload.body
    await session.commit()
    await session.refresh(entry)
    return entry


async def delete_entry(session: AsyncSession, user: User, shipment_id: int, entry_id: int) -> None:
    await get_shipment_or_404(session, shipment_id, user)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    await session.delete(entry)
    await session.commit()
    log.info("shipment.entry_deleted", shipment_id=shipment_id, entry_id=entry_id, by=user.id)
