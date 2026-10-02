"""Администрирование: пользователи и сводная статистика."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.api.deps import AdminUser, SessionDep
from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.crm import Lead, Stage
from app.models.security import LoginAttempt
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services.stages import ensure_default_stages

log = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["администрирование"])


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
    """Удаляет сотрудника, передавая его лиды администратору.

    Доска увольняемого исчезает вместе с ним, поэтому карточки нужно куда-то
    деть: иначе они остались бы без ответственного и пропали из интерфейса.
    Передаём их тому администратору, который выполняет удаление, — дальше он
    раздаёт их вручную. Заявки, документы и лента едут вместе с лидом.
    """
    if user_id == current.id:
        raise AppError("Нельзя удалить самого себя", code="self_delete")
    user = await session.get(User, user_id)
    if user is None:
        raise NotFoundError(f"Пользователь {user_id} не найден")

    moved = await transfer_leads(session, from_user_id=user_id, to_user=current)

    await session.delete(user)
    await session.commit()
    log.info("user.deleted", user_id=user_id, by=current.id, leads_moved=moved)


# --- безопасность ------------------------------------------------------------
def _scan_backups(directory: Path) -> tuple[list[dict[str, Any]], float | None]:
    """Синхронное чтение каталога бэкапов — вызывается в пуле потоков."""
    files = sorted(directory.glob("crm-*.dump"), key=lambda f: f.stat().st_mtime, reverse=True)
    results: list[dict[str, Any]] = [{"name": f.name, "size": f.stat().st_size} for f in files]
    last_mtime = files[0].stat().st_mtime if files else None
    return results, last_mtime


@router.get("/backups", summary="Список резервных копий")
async def list_backups(_: AdminUser) -> dict[str, Any]:
    """Файлы из каталога бэкапов + признак «копия устарела»."""
    from app.api.v1.attachments import disk_usage

    # Чтение каталога — блокирующие вызовы, выносим в пул потоков.
    results, last_mtime = await run_in_threadpool(_scan_backups, Path(settings.backup_dir))
    age_hours = (
        round((datetime.now(tz=UTC).timestamp() - last_mtime) / 3600, 1) if last_mtime else None
    )

    return {
        "storage": await disk_usage(),
        "results": results,
        "last_backup_at": (
            datetime.fromtimestamp(last_mtime, tz=UTC).isoformat() if last_mtime else None
        ),
        "age_hours": age_hours,
        "is_stale": age_hours is None or age_hours > settings.backup_stale_hours,
    }


@router.post("/backup", status_code=status.HTTP_202_ACCEPTED, summary="Запустить бэкап")
async def run_backup(_: AdminUser) -> dict[str, str]:
    """Ставит задачу в очередь Celery — ответ приходит сразу, работа идёт в воркере."""
    from app.worker.celery_app import celery

    task = celery.send_task("app.worker.tasks.backup_database")
    log.info("backup.queued", task_id=task.id)
    return {"task_id": task.id, "detail": "Задача поставлена в очередь"}


@router.get("/login-attempts", summary="Неудачные попытки входа")
async def login_attempts(session: SessionDep, _: AdminUser) -> list[dict[str, Any]]:
    """Сгруппировано по паре «учётная запись + IP», сверху самые свежие."""
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
