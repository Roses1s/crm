"""HTTP-слой заявок на перевозку.

Бизнес-логика живёт в `app.services.shipments`.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep
from app.core.pagination import PageParams, page_params
from app.models.shipment import Shipment, ShipmentStatus
from app.models.timeline import TimelineEntry
from app.schemas.crm import NoteCreate, NoteUpdate, TimelineEntryRead
from app.schemas.shipment import (
    ShipmentCreate,
    ShipmentListItem,
    ShipmentPage,
    ShipmentRead,
    ShipmentStatusUpdate,
    ShipmentUpdate,
)
from app.services import shipments as service
from app.services.shipments import STAGE_LABELS

router = APIRouter(tags=["заявки"])

PageParamsDep = Annotated[PageParams, Depends(page_params)]


@router.get("/shipments", response_model=ShipmentPage, summary="Список заявок")
async def list_shipments(
    session: SessionDep,
    user: CurrentUser,
    params: PageParamsDep,
    status_filter: Annotated[ShipmentStatus | None, Query(alias="status")] = None,
    search: Annotated[str | None, Query(alias="search")] = None,
) -> dict[str, Any]:
    return await service.list_shipments(
        session, user, params, status_filter=status_filter, search=search
    )


@router.post(
    "/shipments",
    response_model=ShipmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Создать заявку",
)
async def create_shipment(
    payload: ShipmentCreate, session: SessionDep, user: CurrentUser
) -> Shipment:
    return await service.create_shipment(session, user, payload)


@router.get("/shipments/{shipment_id}", response_model=ShipmentRead, summary="Карточка заявки")
async def get_shipment(shipment_id: int, session: SessionDep, user: CurrentUser) -> Shipment:
    return await service.get_shipment_or_404(session, shipment_id, user, allow_lost=True)


@router.patch("/shipments/{shipment_id}", response_model=ShipmentRead, summary="Изменить заявку")
async def update_shipment(
    shipment_id: int, payload: ShipmentUpdate, session: SessionDep, user: CurrentUser
) -> Shipment:
    return await service.update_shipment(session, user, shipment_id, payload)


@router.patch(
    "/shipments/{shipment_id}/status", response_model=ShipmentRead, summary="Сменить статус"
)
async def set_status(
    shipment_id: int, payload: ShipmentStatusUpdate, session: SessionDep, user: CurrentUser
) -> Shipment:
    return await service.set_status(session, user, shipment_id, payload)


@router.get(
    "/shipments/{shipment_id}/timeline",
    response_model=list[TimelineEntryRead],
    summary="Лента чаттера заявки",
)
async def shipment_timeline(
    shipment_id: int, session: SessionDep, user: CurrentUser
) -> list[TimelineEntry]:
    return await service.shipment_timeline(session, user, shipment_id)


@router.post(
    "/shipments/{shipment_id}/notes",
    response_model=TimelineEntryRead,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить примечание к заявке",
)
async def add_shipment_note(
    shipment_id: int, payload: NoteCreate, session: SessionDep, user: CurrentUser
) -> TimelineEntry:
    return await service.add_note(session, user, shipment_id, payload)


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
    return await service.update_entry(session, user, shipment_id, entry_id, payload)


@router.delete(
    "/shipments/{shipment_id}/timeline/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить запись из ленты заявки",
)
async def delete_shipment_entry(
    shipment_id: int, entry_id: int, session: SessionDep, user: CurrentUser
) -> None:
    await service.delete_entry(session, user, shipment_id, entry_id)


@router.get(
    "/leads/{lead_id}/shipments",
    response_model=list[ShipmentListItem],
    summary="Заявки конкретного лида",
)
async def lead_shipments(lead_id: int, session: SessionDep, user: CurrentUser) -> list[Shipment]:
    return await service.lead_shipments(session, user, lead_id)


__all__ = ["STAGE_LABELS", "router"]
