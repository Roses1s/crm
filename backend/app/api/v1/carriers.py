"""Перевозчики."""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi_cache.decorator import cache
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, ManagerUser, SessionDep
from app.core.cache import invalidate, public_key_builder
from app.core.config import settings
from app.core.errors import NotFoundError
from app.models.carrier import Carrier
from app.schemas.carrier import CarrierCreate, CarrierRead, CarrierUpdate

router = APIRouter(prefix="/carriers", tags=["перевозчики"])

# Справочник перевозчиков общий для всех и меняется редко — кешируем.
# Разные значения ?only_active попадают в разные ключи (query входит в ключ).
CACHE_NS = "carriers"


@router.get("", response_model=list[CarrierRead], summary="Список перевозчиков")
@cache(expire=settings.cache_ttl_seconds, namespace=CACHE_NS, key_builder=public_key_builder)
async def list_carriers(
    session: SessionDep, _: CurrentUser, only_active: bool = False
) -> list[Carrier]:
    stmt = select(Carrier).order_by(Carrier.name)
    if only_active:
        stmt = stmt.where(Carrier.is_active.is_(True))
    return list((await session.execute(stmt)).scalars().all())


@router.post(
    "", response_model=CarrierRead, status_code=status.HTTP_201_CREATED, summary="Добавить"
)
async def create_carrier(payload: CarrierCreate, session: SessionDep, _: ManagerUser) -> Carrier:
    carrier = Carrier(**payload.model_dump())
    session.add(carrier)
    await session.commit()
    await session.refresh(carrier)
    await invalidate(CACHE_NS)  # справочник изменился — сбрасываем кеш
    return carrier


@router.patch("/{carrier_id}", response_model=CarrierRead, summary="Изменить")
async def update_carrier(
    carrier_id: int, payload: CarrierUpdate, session: SessionDep, _: AdminUser
) -> Carrier:
    carrier = await session.get(Carrier, carrier_id)
    if carrier is None:
        raise NotFoundError(f"Перевозчик {carrier_id} не найден")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(carrier, key, value)
    await session.commit()
    await session.refresh(carrier)
    await invalidate(CACHE_NS)  # справочник изменился — сбрасываем кеш
    return carrier
