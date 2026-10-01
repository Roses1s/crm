"""Перевозчики."""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi_cache.decorator import cache
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import AdminUser, CurrentUser, ManagerUser, SessionDep
from app.core.cache import invalidate, public_key_builder
from app.core.config import settings
from app.core.errors import NotFoundError
from app.models.carrier import Carrier
from app.schemas.carrier import CarrierCreate, CarrierRead, CarrierTagsUpdate, CarrierUpdate
from app.services.tags import fetch_tags

router = APIRouter(prefix="/carriers", tags=["перевозчики"])

# Справочник перевозчиков общий для всех и меняется редко — кешируем.
# Разные значения ?only_active попадают в разные ключи (query входит в ключ).
CACHE_NS = "carriers"


async def _get_carrier_or_404(session: AsyncSession, carrier_id: int) -> Carrier:
    """Перевозчик с заранее подгруженными тегами.

    Важно брать его именно так (а не ``session.get``) перед тем, как менять
    ``carrier.tags``: присваивание новой коллекции требует знать старую, а
    её ленивая подгрузка на async-сессии вне ``await`` падает с
    ``MissingGreenlet``. ``populate_existing`` вдобавок перезаписывает уже
    закешированную в identity map версию — иначе после commit() в ответе
    могли бы остаться старые теги. См. app.services.leads.get_lead_or_404.
    """
    stmt = (
        select(Carrier)
        .where(Carrier.id == carrier_id)
        .options(selectinload(Carrier.tags))
        .execution_options(populate_existing=True)
    )
    carrier = (await session.execute(stmt)).scalar_one_or_none()
    if carrier is None:
        raise NotFoundError(f"Перевозчик {carrier_id} не найден")
    return carrier


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
    data = payload.model_dump(exclude={"tag_ids"})
    carrier = Carrier(**data)
    # Новый, ещё не сохранённый объект: присваивание коллекции не требует
    # подгрузки старого значения из базы — в отличие от уже существующего.
    carrier.tags = await fetch_tags(session, payload.tag_ids)
    session.add(carrier)
    await session.commit()
    await invalidate(CACHE_NS)  # справочник изменился — сбрасываем кеш
    return await _get_carrier_or_404(session, carrier.id)


@router.patch("/{carrier_id}", response_model=CarrierRead, summary="Изменить")
async def update_carrier(
    carrier_id: int, payload: CarrierUpdate, session: SessionDep, _: AdminUser
) -> Carrier:
    carrier = await _get_carrier_or_404(session, carrier_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(carrier, key, value)
    await session.commit()
    await invalidate(CACHE_NS)  # справочник изменился — сбрасываем кеш
    return await _get_carrier_or_404(session, carrier_id)


@router.put("/{carrier_id}/tags", response_model=CarrierRead, summary="Проставить теги")
async def set_carrier_tags(
    carrier_id: int, payload: CarrierTagsUpdate, session: SessionDep, _: CurrentUser
) -> Carrier:
    """Теги — рабочая пометка, а не справочное поле, поэтому их может менять
    любой сотрудник, в отличие от остальных полей перевозчика (там — админ)."""
    carrier = await _get_carrier_or_404(session, carrier_id)
    carrier.tags = await fetch_tags(session, payload.tag_ids)
    await session.commit()
    await invalidate(CACHE_NS)
    return await _get_carrier_or_404(session, carrier_id)
