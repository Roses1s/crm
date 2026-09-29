"""Теги лидов."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import AdminUser, CurrentUser, SessionDep
from app.core.errors import NotFoundError
from app.models.crm import Tag
from app.schemas.crm import TagCreate, TagRead

router = APIRouter(prefix="/crm/tags", tags=["crm: теги"])


@router.get("", response_model=list[TagRead], summary="Все теги")
async def list_tags(session: SessionDep, _: CurrentUser) -> list[Tag]:
    return list((await session.execute(select(Tag).order_by(Tag.name))).scalars().all())


@router.post("", response_model=TagRead, status_code=status.HTTP_201_CREATED, summary="Создать тег")
async def create_tag(payload: TagCreate, session: SessionDep, _: AdminUser) -> Tag:
    tag = Tag(**payload.model_dump())
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить тег")
async def delete_tag(tag_id: int, session: SessionDep, _: AdminUser) -> None:
    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(f"Тег {tag_id} не найден")
    await session.delete(tag)
    await session.commit()
