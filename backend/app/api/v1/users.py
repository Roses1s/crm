"""Список коллег для передачи лида.

Полный список сотрудников доступен только администратору (`/admin/users`),
но менеджеру нужно кому-то передать карточку. Поэтому здесь облегчённая
выдача: только имя, фамилия и номер — без почты, ролей и признака активности.
"""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.models.user import User
from app.schemas.user import ColleagueRead

router = APIRouter(prefix="/users", tags=["сотрудники"])


@router.get("/colleagues", response_model=list[ColleagueRead], summary="Активные сотрудники")
async def list_colleagues(session: SessionDep, user: CurrentUser) -> list[User]:
    stmt = (
        select(User)
        .where(User.is_active.is_(True), User.id != user.id)
        .order_by(User.last_name, User.first_name)
    )
    return list((await session.execute(stmt)).scalars().all())
