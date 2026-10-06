"""Бизнес-логика администрирования: сотрудники, бэкапы, журнал входа.

Раньше жила прямо в роутере ``api/v1/admin.py`` (замечание Б-24 ревью):
толстые обработчики сложно тестировать отдельно от HTTP. Здесь — чистые
функции; роутер только проверяет права и разбирает запрос.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.crm import Lead, Stage
from app.models.security import LoginAttempt
from app.models.user import Role, User
from app.schemas.user import UserCreate, UserUpdate
from app.services.stages import ensure_default_stages

log = get_logger(__name__)


# --- сотрудники ---------------------------------------------------------------


async def list_users(session: AsyncSession) -> list[User]:
    return list((await session.execute(select(User).order_by(User.role, User.id))).scalars().all())


async def create_user(session: AsyncSession, payload: UserCreate) -> User:
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


async def update_user(session: AsyncSession, user_id: int, payload: UserUpdate) -> User:
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError(f"Пользователь {user_id} не найден")
    data = payload.model_dump(exclude_unset=True)
    # Снятие роли администратора или отключение учётной записи проверяем до
    # изменения: последний администратор должен остаться.
    loses_admin = data.get("role") is not None and data["role"] != Role.admin
    gets_disabled = data.get("is_active") is False
    if loses_admin or gets_disabled:
        await ensure_not_last_admin(session, user)
    if password := data.pop("password", None):
        user.hashed_password = hash_password(password)
    if email := data.pop("email", None):
        user.email = email.lower()
    for key, value in data.items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return user


async def delete_user(session: AsyncSession, *, current: User, user_id: int) -> int:
    """Удаляет сотрудника, передавая его лиды администратору.

    Доска увольняемого исчезает вместе с ним, поэтому карточки нужно куда-то
    деть: иначе они остались бы без ответственного и пропали из интерфейса.
    Передаём их тому администратору, который выполняет удаление, — дальше он
    раздаёт их вручную. Заявки, документы и лента едут вместе с лидом.
    Возвращает число перенесённых карточек.
    """
    if user_id == current.id:
        raise AppError("Нельзя удалить самого себя", code="self_delete")
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError(f"Пользователь {user_id} не найден")
    await ensure_not_last_admin(session, user)

    moved = await transfer_leads(session, from_user_id=user_id, to_user=current)

    await session.delete(user)
    await session.commit()
    log.info("user.deleted", user_id=user_id, by=current.id, leads_moved=moved)
    return moved


async def transfer_leads(session: AsyncSession, *, from_user_id: int, to_user: User) -> int:
    """Переносит лиды сотрудника на доску администратора. Возвращает их число.

    Этап подбираем по названию: если у администратора есть колонка с таким же
    именем, карточка встаёт в неё, иначе — в первую. Без этого лид ссылался бы
    на удалённый этап и база отказала бы в удалении сотрудника.
    """
    leads = list(
        (await session.execute(select(Lead).where(Lead.assigned_to_id == from_user_id)))
        .unique()
        .scalars()
    )
    if not leads:
        return 0

    # У администратора может не быть доски, если он ни разу её не открывал.
    await ensure_default_stages(session, to_user.id)
    target_stages = list(
        (
            await session.execute(
                select(Stage).where(Stage.owner_id == to_user.id).order_by(Stage.sequence, Stage.id)
            )
        ).scalars()
    )
    by_name = {stage.name: stage for stage in target_stages}
    fallback = target_stages[0]

    old_stages = {
        stage.id: stage
        for stage in (
            await session.execute(select(Stage).where(Stage.owner_id == from_user_id))
        ).scalars()
    }

    for lead in leads:
        old = old_stages.get(lead.stage_id)
        same_name = by_name.get(old.name) if old else None
        lead.stage_id = (same_name or fallback).id
        lead.assigned_to_id = to_user.id

    await session.flush()
    return len(leads)


async def _other_active_admins(session: AsyncSession, user_id: int) -> int:
    """Сколько в системе ДРУГИХ действующих администраторов."""
    stmt = select(func.count()).where(
        User.role == Role.admin,
        User.is_active.is_(True),
        User.id != user_id,
    )
    return int((await session.execute(stmt)).scalar_one())


async def ensure_not_last_admin(session: AsyncSession, user: User) -> None:
    """Не даёт убрать последнего администратора.

    Без этой проверки администратор мог снять с себя роль или отключить
    собственную учётную запись — и в системе не оставалось никого, кто может
    заводить сотрудников, смотреть бэкапы и удалять лиды. Вернуть доступ можно
    было бы только руками через базу на сервере.
    """
    if user.role != Role.admin or not user.is_active:
        return
    if await _other_active_admins(session, user.id) == 0:
        raise AppError(
            "Это последний действующий администратор — сначала назначьте другого",
            code="last_admin",
        )


# --- безопасность -------------------------------------------------------------


def scan_backups(directory: Path) -> tuple[list[dict[str, Any]], float | None]:
    """Синхронное чтение каталога бэкапов — вызывается в пуле потоков.

    Один stat() на файл (И-10 ревью 06.10): раньше по каждому файлу звали
    stat дважды — при сортировке и при сборе размера. Файл, исчезнувший
    между списком каталога и stat (ночная уборка), просто пропускаем.
    """
    entries: list[tuple[Path, os.stat_result]] = []
    for path in directory.glob("crm-*.dump"):
        try:
            entries.append((path, path.stat()))
        except OSError:
            continue
    entries.sort(key=lambda item: item[1].st_mtime, reverse=True)
    results: list[dict[str, Any]] = [
        {"name": path.name, "size": stat.st_size} for path, stat in entries
    ]
    last_mtime = entries[0][1].st_mtime if entries else None
    return results, last_mtime


def backup_age_hours(last_mtime: float | None) -> float | None:
    """Сколько часов назад была последняя копия (для признака «устарела»)."""
    if last_mtime is None:
        return None
    return round((datetime.now(tz=UTC).timestamp() - last_mtime) / 3600, 1)


async def login_attempts(session: AsyncSession) -> list[dict[str, Any]]:
    """Неудачные входы, сгруппированные по паре «учётная запись + IP»."""
    rows = (
        await session.execute(
            select(
                LoginAttempt.email,
                LoginAttempt.ip_address,
                func.max(LoginAttempt.created_at).label("last_seen"),
                func.count().label("failures"),
            )
            .where(LoginAttempt.successful.is_(False))
            .group_by(LoginAttempt.email, LoginAttempt.ip_address)
            .order_by(func.max(LoginAttempt.created_at).desc())
            .limit(50)
        )
    ).all()

    return [
        {
            "id": index + 1,
            "username": row.email,
            "ip_address": row.ip_address or "—",
            "attempt_time": str(row.last_seen),
            "failures": int(row.failures),
        }
        for index, row in enumerate(rows)
    ]
