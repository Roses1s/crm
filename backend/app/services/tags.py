"""Общая логика тегов.

Используется карточкой лида. У заявок связь с тегами в базе сохранена, но
поле убрано с экрана 03.10.2026 — см. `app/api/v1/tags.py`.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.models.crm import Tag


async def fetch_tags(session: AsyncSession, tag_ids: list[int]) -> list[Tag]:
    """Теги по id, в произвольном порядке (как и пришли из БД).

    Несуществующий id — ошибка, а не повод молча вернуть меньше тегов: раньше
    устаревший id (тег успел удалить коллега) приводил к тому, что сохранение
    отвечало 200 и стирало у записи ВСЕ теги.
    """
    if not tag_ids:
        return []
    rows = list((await session.execute(select(Tag).where(Tag.id.in_(tag_ids)))).scalars().all())
    missing = sorted(set(tag_ids) - {tag.id for tag in rows})
    if missing:
        raise NotFoundError(
            "Теги не найдены (возможно, их удалил кто-то другой): "
            + ", ".join(str(tag_id) for tag_id in missing)
        )
    return rows


def tag_name_key(name: str) -> str:
    """Общий ключ сравнения: пробелы по краям и регистр не различают теги."""
    return name.strip().casefold()


async def lock_tag_name(session: AsyncSession, name: str) -> None:
    """Не даёт двум запросам одновременно занять одно имя тега.

    Проверки перед INSERT/UPDATE сами по себе не защищают от гонки: два
    запроса могут одновременно не найти имя и оба сохранить его. На PostgreSQL
    берём транзакционную advisory-блокировку по нормализованному имени; второй
    запрос ждёт коммита первого и затем видит созданный тег. В тестовой SQLite
    блокировка не нужна и такой SQL-функции нет.
    """
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        await session.execute(
            text("SELECT pg_advisory_xact_lock(4228, hashtext(:name))"),
            {"name": tag_name_key(name)},
        )


async def find_tag_by_name(
    session: AsyncSession, name: str, *, excluding_id: int | None = None
) -> Tag | None:
    """Находит имя без учёта регистра, в том числе для кириллицы.

    Сравниваем через Python ``casefold()``, а не SQL ``lower()``: в SQLite
    последняя функция регистронезависима только для ASCII. Тегов в системе мало
    (это рабочий справочник, не таблица фактов), поэтому загрузка всех — не
    проблема; к тому же список тегов и так кешируется.

    ``excluding_id`` нужен при переименовании: тег можно переименовать только
    если такое имя не занято другой записью.
    """
    target = tag_name_key(name)
    rows = (await session.execute(select(Tag).order_by(Tag.id))).scalars().all()
    for tag in rows:
        if tag.id != excluding_id and tag_name_key(tag.name) == target:
            return tag
    return None


async def create_or_get_tag(session: AsyncSession, *, name: str, color: str) -> tuple[Tag, bool]:
    """Создаёт тег либо возвращает существующий с тем же нормализованным именем."""
    await lock_tag_name(session, name)
    existing = await find_tag_by_name(session, name)
    if existing is not None:
        return existing, False

    tag = Tag(name=name, color=color)
    session.add(tag)
    await session.commit()
    await session.refresh(tag)
    return tag, True


async def update_tag(session: AsyncSession, tag_id: int, changes: Mapping[str, Any]) -> Tag:
    """Меняет тег, не позволяя занять имя другой записи."""
    name = changes.get("name")
    if name is not None:
        # Тот же ключ блокировки использует создание — оно тоже не может
        # обойти проверку во время переименования.
        await lock_tag_name(session, name)

    tag = await session.get(Tag, tag_id)
    if tag is None:
        raise NotFoundError(f"Тег {tag_id} не найден")
    if name is not None and tag_name_key(name) != tag_name_key(tag.name):
        existing = await find_tag_by_name(session, name, excluding_id=tag.id)
        if existing is not None:
            raise AppError(
                f"Тег с названием «{existing.name}» уже существует",
                code="tag_name_conflict",
                status_code=409,
            )

    for key, value in changes.items():
        setattr(tag, key, value)
    await session.commit()
    await session.refresh(tag)
    return tag
