"""Администрирование: пользователи и сводная статистика."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from fastapi_cache.decorator import cache
from sqlalchemy import func, select

from app.api.deps import AdminUser, ManagerUser, SessionDep
from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.core.security import hash_password
from app.models.crm import Lead, Stage
from app.models.shipment import Shipment
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/admin", tags=["администрирование"])


@router.get("/stats", summary="Сводка для дашборда")
@cache(expire=settings.cache_ttl_seconds)
async def stats(session: SessionDep, _: ManagerUser) -> dict[str, Any]:
    """Цифры для дашборда. Ответ кешируется в Valkey на минуту."""
    leads_total = int(
        (
            await session.execute(
                select(func.count()).select_from(Lead).where(Lead.is_archived.is_(False))
            )
        ).scalar_one()
    )
    leads_archived = int(
        (
            await session.execute(
                select(func.count()).select_from(Lead).where(Lead.is_archived.is_(True))
            )
        ).scalar_one()
    )
    shipments_total = int(
        (await session.execute(select(func.count()).select_from(Shipment))).scalar_one()
    )
    users_total = int((await session.execute(select(func.count()).select_from(User))).scalar_one())

    funnel_rows = (
        await session.execute(
            select(Stage.id, Stage.name, func.count(Lead.id))
            .select_from(Stage)
            .outerjoin(Lead, (Lead.stage_id == Stage.id) & (Lead.is_archived.is_(False)))
            .group_by(Stage.id, Stage.name, Stage.sequence)
            .order_by(Stage.sequence, Stage.id)
        )
    ).all()

    return {
        "leads_total": leads_total,
        "leads_archived": leads_archived,
        "shipments_total": shipments_total,
        "users_total": users_total,
        "funnel": [{"id": r[0], "name": r[1], "count": int(r[2])} for r in funnel_rows],
    }


@router.get("/users", response_model=list[UserRead], summary="Пользователи")
async def list_users(session: SessionDep, _: AdminUser) -> list[User]:
    stmt = select(User).order_by(User.role, User.id)
    return list((await session.execute(stmt)).scalars().all())


@router.post(
    "/users", response_model=UserRead, status_code=status.HTTP_201_CREATED, summary="Создать"
)
async def create_user(payload: UserCreate, session: SessionDep, _: AdminUser) -> User:
    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
        first_name=payload.first_name,
        last_name=payload.last_name,
        role=payload.role,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserRead, summary="Изменить")
async def update_user(user_id: int, payload: UserUpdate, session: SessionDep, _: AdminUser) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError(f"Пользователь {user_id} не найден")
    data = payload.model_dump(exclude_unset=True)
    if password := data.pop("password", None):
        user.hashed_password = hash_password(password)
    if email := data.pop("email", None):
        user.email = email.lower()
    for key, value in data.items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return user


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить")
async def delete_user(user_id: int, session: SessionDep, current: AdminUser) -> None:
    if user_id == current.id:
        raise AppError("Нельзя удалить самого себя", code="self_delete")
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError(f"Пользователь {user_id} не найден")
    await session.delete(user)
    await session.commit()
