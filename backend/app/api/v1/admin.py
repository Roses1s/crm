"""Администрирование: пользователи и сводная статистика."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from fastapi import APIRouter, status
from fastapi_cache.decorator import cache
from sqlalchemy import func, select

from app.api.deps import AdminUser, SessionDep
from app.core.config import settings
from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.core.security import hash_password
from app.models.crm import Lead, Stage
from app.models.security import LoginAttempt
from app.models.shipment import Shipment
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate

log = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["администрирование"])


@router.get("/stats", summary="Сводка для дашборда")
@cache(expire=settings.cache_ttl_seconds)
async def stats(session: SessionDep, _: AdminUser) -> dict[str, Any]:
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


# --- безопасность ------------------------------------------------------------
@router.get("/backups", summary="Список резервных копий")
async def list_backups(_: AdminUser) -> dict[str, Any]:
    """Файлы из каталога бэкапов + признак «копия устарела»."""
    directory = Path(settings.backup_dir)
    files = sorted(directory.glob("crm-*.dump"), key=lambda f: f.stat().st_mtime, reverse=True)

    results = [{"name": f.name, "size": f.stat().st_size} for f in files]
    last_mtime = files[0].stat().st_mtime if files else None
    age_hours = (
        round((datetime.now(tz=UTC).timestamp() - last_mtime) / 3600, 1) if last_mtime else None
    )
    from app.api.v1.attachments import disk_usage

    return {
        "storage": disk_usage(),
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
