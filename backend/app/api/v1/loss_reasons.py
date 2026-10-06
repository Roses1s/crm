"""Причины проигрыша лида."""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi_cache.decorator import cache
from sqlalchemy import func, select

from app.api.deps import AdminUser, CurrentUser, SessionDep
from app.core.cache import invalidate, public_key_builder
from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.models.crm import Lead, LossReason
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
    # Причина «в работе» — часть истории проигранных лидов: у причины в базе
    # стоит ondelete=SET NULL, и удаление молча стёрло бы её из карточек,
    # которые уже проиграли с этой причиной (ревью 03.10, Б-15). Неиспользуемую
    # можно удалить свободно.
    in_use = int(
        (
            await session.execute(select(func.count()).where(Lead.loss_reason_id == reason.id))
        ).scalar_one()
    )
    if in_use:
        raise AppError(
            f"Причиной «{reason.name}» помечены {in_use} проигранных "
            f"{'лид' if in_use == 1 else 'лида' if in_use in (2, 3, 4) else 'лидов'} — "
            "сначала переведите их на другую причину",
            code="loss_reason_in_use",
        )
    await session.delete(reason)
    await session.commit()
    await invalidate(CACHE_NS)
