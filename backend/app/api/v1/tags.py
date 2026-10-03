"""Теги: общий свободный справочник.

На экране теги есть только у лидов: 03.10.2026 владелец убрал поле из
карточки заявки. Связь `shipment_tags` в базе осталась (значения приезжают
и уходят без изменений), поэтому вернуть поле можно одной правкой вёрстки.

Красить и создавать теги может любой сотрудник — это не настройка системы,
а рабочий инструмент вроде наклеек на канбане. Поэтому ни одна ручка здесь не
требует прав администратора.
"""

from __future__ import annotations

from fastapi import APIRouter, status
from fastapi_cache.decorator import cache
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.core.cache import invalidate, public_key_builder
from app.core.config import settings
from app.core.errors import NotFoundError
from app.models.crm import Tag
from app.schemas.crm import TagCreate, TagRead, TagUpdate
from app.services.tags import find_tag_by_name

router = APIRouter(prefix="/crm/tags", tags=["crm: теги"])

# Список тегов одинаков для всех и меняется редко — кешируем его целиком.
CACHE_NS = "tags"


@router.get("", response_model=list[TagRead], summary="Все теги")
@cache(expire=settings.cache_ttl_seconds, namespace=CACHE_NS, key_builder=public_key_builder)
async def list_tags(session: SessionDep, _: CurrentUser) -> list[Tag]:
    return list((await session.execute(select(Tag).order_by(Tag.name))).scalars().all())


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED, summary="Создать тег")
async def create_tag(payload: TagCreate, session: SessionDep, _: CurrentUser) -> Tag:
    # Имя уникально в базе: если тег с таким названием (без учёта регистра)
    # уже есть, отдаём его, а не падаем ошибкой уникальности — два человека
    # могли одновременно захотеть один и тот же тег.
    existing = await find_tag_by_name(session, payload.name)
    if existing is not None:
        return existing
    tag = Tag(**payload.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    await invalidate(CACHE_NS)  # список тегов изменился — сбрасываем кеш
    return tag


@router.patch("/{tag_id}", response_model=TagRead, summary="Переименовать / перекрасить тег")
async def update_tag(tag_id: int, payload: TagUpdate, session: SessionDep, _: CurrentUser) -> Tag:
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(f"Тег {tag_id} не найден")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tag, key, value)
    await session.commit()
    await session.refresh(tag)
    await invalidate(CACHE_NS)  # тег изменился — сбрасываем кеш
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить тег")
async def delete_tag(tag_id: int, session: SessionDep, _: CurrentUser) -> None:
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(f"Тег {tag_id} не найден")
    await session.delete(tag)
    await session.commit()
    await invalidate(CACHE_NS)  # список тегов изменился — сбрасываем кеш
