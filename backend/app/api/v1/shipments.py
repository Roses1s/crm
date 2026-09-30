"""Заявки на перевозку."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, SessionDep
from app.api.v1.leads import get_lead_or_404
from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.core.pagination import Page, PageParams, build_page, page_params, paginate
from app.models.crm import Lead
from app.models.shipment import Shipment, ShipmentStatus
from app.models.timeline import EntryType, TimelineEntry
from app.models.user import Role, User
from app.schemas.crm import NoteCreate, NoteUpdate, TimelineEntryRead
from app.schemas.shipment import (
    ShipmentCreate,
    ShipmentListItem,
    ShipmentRead,
    ShipmentStatusUpdate,
    ShipmentUpdate,
)

router = APIRouter(tags=["заявки"])
log = get_logger(__name__)

PageParamsDep = Annotated[PageParams, Depends(page_params)]

# Русские подписи этапов для записи в ленту при смене этапа.
STAGE_LABELS: dict[ShipmentStatus, str] = {
    ShipmentStatus.new: "Новая",
    ShipmentStatus.checked: "Проверена и подписана заявка",
    ShipmentStatus.loaded: "Машина загрузилась",
    ShipmentStatus.unloaded: "Машина выгрузилась",
}


async def _get_or_404(session: SessionDep, shipment_id: int, user: User | None = None) -> Shipment:
    shipment = await session.get(Shipment, shipment_id)
    if shipment is None:
        raise NotFoundError(f"Заявка {shipment_id} не найдена")
    # Заявка наследует видимость своего лида: чужая для менеджера не существует.
    if user is not None and user.role != Role.admin:
        await get_lead_or_404(session, shipment.lead_id, user)
    return shipment


def _visible_shipments(stmt: Any, user: User) -> Any:
    """Менеджеру показываем только заявки по его лидам."""
    if user.role == Role.admin:
        return stmt
    return stmt.where(Shipment.lead_id.in_(select(Lead.id).where(Lead.assigned_to_id == user.id)))


@router.get("/shipments", response_model=Page[ShipmentListItem], summary="Список заявок")
async def list_shipments(
    session: SessionDep,
    user: CurrentUser,
    params: PageParamsDep,
    status_filter: Annotated[ShipmentStatus | None, Query(alias="status")] = None,
) -> dict[str, Any]:
    stmt = _visible_shipments(select(Shipment).order_by(Shipment.created_at.desc()), user)
    if status_filter is not None:
        stmt = stmt.where(Shipment.status == status_filter)
    items, total = await paginate(session, stmt, params)
    return build_page(items, total, params)


@router.post(
    "/shipments",
    response_model=ShipmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Создать заявку",
)
async def create_shipment(
    payload: ShipmentCreate, session: SessionDep, user: CurrentUser
) -> Shipment:
    # Заявку можно завести только по своему лиду.
    await get_lead_or_404(session, payload.lead_id, user)
    shipment = Shipment(**payload.model_dump())
    session.add(shipment)
    await session.commit()
    await session.refresh(shipment)
    log.info("shipment.created", shipment_id=shipment.id, by=user.id)
    return shipment


@router.get("/shipments/{shipment_id}", response_model=ShipmentRead, summary="Карточка заявки")
async def get_shipment(shipment_id: int, session: SessionDep, user: CurrentUser) -> Shipment:
    return await _get_or_404(session, shipment_id, user)


@router.patch("/shipments/{shipment_id}", response_model=ShipmentRead, summary="Изменить заявку")
async def update_shipment(
    shipment_id: int, payload: ShipmentUpdate, session: SessionDep, user: CurrentUser
) -> Shipment:
    shipment = await _get_or_404(session, shipment_id, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(shipment, key, value)
    await session.commit()
    await session.refresh(shipment)
    return shipment


@router.patch(
    "/shipments/{shipment_id}/status", response_model=ShipmentRead, summary="Сменить статус"
)
async def set_status(
    shipment_id: int, payload: ShipmentStatusUpdate, session: SessionDep, user: CurrentUser
) -> Shipment:
    shipment = await _get_or_404(session, shipment_id, user)
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


async def _get_entry_or_404(
    session: AsyncSession, shipment_id: int, entry_id: int
) -> TimelineEntry:
    entry = await session.get(TimelineEntry, entry_id)
    if entry is None or entry.shipment_id != shipment_id:
        raise NotFoundError(f"Запись {entry_id} не найдена")
    return entry


@router.get(
    "/shipments/{shipment_id}/timeline",
    response_model=list[TimelineEntryRead],
    summary="Лента чаттера заявки",
)
async def shipment_timeline(
    shipment_id: int, session: SessionDep, user: CurrentUser
) -> list[TimelineEntry]:
    await _get_or_404(session, shipment_id, user)
    stmt = (
        select(TimelineEntry)
        .where(TimelineEntry.shipment_id == shipment_id)
        .order_by(TimelineEntry.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


@router.post(
    "/shipments/{shipment_id}/notes",
    response_model=TimelineEntryRead,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить примечание к заявке",
)
async def add_shipment_note(
    shipment_id: int, payload: NoteCreate, session: SessionDep, user: CurrentUser
) -> TimelineEntry:
    shipment = await _get_or_404(session, shipment_id, user)
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


@router.patch(
    "/shipments/{shipment_id}/timeline/{entry_id}",
    response_model=TimelineEntryRead,
    summary="Изменить примечание заявки",
)
async def update_shipment_entry(
    shipment_id: int,
    entry_id: int,
    payload: NoteUpdate,
    session: SessionDep,
    user: CurrentUser,
) -> TimelineEntry:
    await _get_or_404(session, shipment_id, user)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    if entry.type is not EntryType.note:
        raise AppError("Изменять можно только примечания", code="not_editable")
    entry.body = payload.body
    await session.commit()
    await session.refresh(entry)
    return entry


@router.delete(
    "/shipments/{shipment_id}/timeline/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить запись из ленты заявки",
)
async def delete_shipment_entry(
    shipment_id: int, entry_id: int, session: SessionDep, user: CurrentUser
) -> None:
    await _get_or_404(session, shipment_id, user)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    await session.delete(entry)
    await session.commit()
    log.info("shipment.entry_deleted", shipment_id=shipment_id, entry_id=entry_id, by=user.id)


@router.get(
    "/leads/{lead_id}/shipments",
    response_model=list[ShipmentListItem],
    summary="Заявки конкретного лида",
)
async def lead_shipments(lead_id: int, session: SessionDep, user: CurrentUser) -> list[Shipment]:
    await get_lead_or_404(session, lead_id, user)
    stmt = select(Shipment).where(Shipment.lead_id == lead_id).order_by(Shipment.created_at.desc())
    return list((await session.execute(stmt)).unique().scalars().all())
