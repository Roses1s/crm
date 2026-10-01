"""Причины проигрыша лида."""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi_cache.decorator import cache
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, SessionDep
from app.core.cache import invalidate, public_key_builder
from app.core.config import settings
from app.core.errors import NotFoundError
from app.models.crm import LossReason
from app.schemas.crm import LossReasonCreate, LossReasonRead

router = APIRouter(prefix="/crm/loss-reasons", tags=["crm: причины проигрыша"])

# Список короткий и меняется редко — кешируем его целиком, как теги.
CACHE_NS = "loss_reasons"


@router.get("", response_model=list[LossReasonRead], summary="Все причины проигрыша")
@cache(expire=settings.cache_ttl_seconds, namespace=CACHE_NS, key_builder=public_key_builder)
async def list_loss_reasons(session: SessionDep, _: CurrentUser) -> list[LossReason]:
    return list(
        (await session.execute(select(LossReason).order_by(LossReason.name))).scalars().all()
    )


@router.post(
    "",
    response_model=LossReasonRead,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить причину проигрыша",
)
async def create_loss_reason(
    payload: LossReasonCreate, session: SessionDep, _: AdminUser
) -> LossReason:
    reason = LossReason(**payload.model_dump())
    session.add(reason)
    await session.commit()
    await session.refresh(reason)
    await invalidate(CACHE_NS)
    return reason


@router.delete(
    "/{reason_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить причину проигрыша"
)
async def delete_loss_reason(reason_id: int, session: SessionDep, _: AdminUser) -> None:
    reason = await session.get(LossReason, reason_id)
    if reason is None:
        raise NotFoundError(f"Причина {reason_id} не найдена")
    await session.delete(reason)
    await session.commit()
    await invalidate(CACHE_NS)
