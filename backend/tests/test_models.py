"""Точечные проверки самих моделей — там, где поведение не сводится к HTTP-ручке."""

from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.exc import InvalidRequestError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


async def test_user_leads_relation_is_not_eager_loaded(session: AsyncSession, seeded: dict) -> None:
    """Регрессия: User.leads не должна грузиться eager'ом на каждый `session.get(User)`.

    Раньше связь была объявлена с ``lazy="selectin"``, из-за чего ЛЮБАЯ загрузка
    пользователя (в т.ч. в ``get_current_user`` — на каждый HTTP-запрос с
    токеном) попутно тянула все лиды сотрудника с тройным джойном и тегами,
    хотя эта коллекция нигде не используется (см. docs/CODE_REVIEW.md).
    Теперь связь объявлена с ``lazy="raise"``: при обращении к ``user.leads``
    без явной подгрузки SQLAlchemy должна упасть понятной ошибкой, а не тихо
    выполнить лишний запрос.
    """
    admin = seeded["admin"]  # type: ignore[index]

    # Свежая загрузка без identity-map "подсказок" — так же, как это делает
    # get_current_user на каждый запрос.
    fresh = (await session.execute(select(User).where(User.id == admin.id))).scalar_one()

    with pytest.raises(InvalidRequestError):
        _ = fresh.leads
