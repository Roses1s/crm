"""Общая логика тегов: используется лидами, перевозчиками и заявками."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crm import Tag


async def fetch_tags(session: AsyncSession, tag_ids: list[int]) -> list[Tag]:
    """Теги по id, в произвольном порядке (как и пришли из БД)."""
    if not tag_ids:
        return []
    rows = (await session.execute(select(Tag).where(Tag.id.in_(tag_ids)))).scalars().all()
    return list(rows)


async def find_tag_by_name(session: AsyncSession, name: str) -> Tag | None:
    """Поиск без учёта регистра — имя тега уникально в БД.

    Сравниваем в Python, а не через SQL ``lower()``: в SQLite эта функция
    регистронезависима только для ASCII и не трогает кириллицу, из-за чего
    «Крупный клиент» и «крупный клиент» считались бы разными строками.
    Тегов в системе мало (это рабочий справочник, не таблица фактов), поэтому
    загрузка всех — не проблема; к тому же список тегов и так кешируется.
    """
    target = name.strip().casefold()
    rows = (await session.execute(select(Tag))).scalars().all()
    for tag in rows:
        if tag.name.strip().casefold() == target:
            return tag
    return None
