"""Заявки на перевозку."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.core.pagination import Page, PageParams, build_page, page_params, paginate
from app.models.shipment import Shipment, ShipmentStatus
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


async def _get_or_404(session: SessionDep, shipment_id: int) -> Shipment:
    shipment = await session.get(Shipment, shipment_id)
    if shipment is None:
        raise NotFoundError(f"Заявка {shipment_id} не найдена")
    return shipment


@router.get("/shipments", response_model=Page[ShipmentListItem], summary="Список заявок")
async def list_shipments(
    session: SessionDep,
    _: CurrentUser,
    params: PageParamsDep,
    status_filter: Annotated[ShipmentStatus | None, Query(alias="status")] = None,
) -> dict[str, Any]:
    stmt = select(Shipment).order_by(Shipment.created_at.desc())
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
    shipment = Shipment(**payload.model_dump())
    session.add(shipment)
    await session.commit()
    await session.refresh(shipment)
    log.info("shipment.created", shipment_id=shipment.id, by=user.id)
    return shipment


@router.get("/shipments/{shipment_id}", response_model=ShipmentRead, summary="Карточка заявки")
async def get_shipment(shipment_id: int, session: SessionDep, _: CurrentUser) -> Shipment:
    return await _get_or_404(session, shipment_id)


@router.patch("/shipments/{shipment_id}", response_model=ShipmentRead, summary="Изменить заявку")
async def update_shipment(
    shipment_id: int, payload: ShipmentUpdate, session: SessionDep, _: CurrentUser
) -> Shipment:
    shipment = await _get_or_404(session, shipment_id)
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
    shipment = await _get_or_404(session, shipment_id)
    shipment.status = payload.status
    await session.commit()
    await session.refresh(shipment)
    log.info("shipment.status", shipment_id=shipment_id, status=payload.status.value, by=user.id)
    return shipment


@router.get(
    "/leads/{lead_id}/shipments",
    response_model=list[ShipmentListItem],
    summary="Заявки конкретного лида",
)
async def lead_shipments(lead_id: int, session: SessionDep, _: CurrentUser) -> list[Shipment]:
    stmt = select(Shipment).where(Shipment.lead_id == lead_id).order_by(Shipment.created_at.desc())
    return list((await session.execute(stmt)).unique().scalars().all())
