"""Администрирование: пользователи, бэкапы, журнал попыток входа.

Роутер тонкий: проверяет права и разбирает запрос, вся работа с базой —
в ``app/services/admin.py`` (Б-24 ревью).
"""

from __future__ import annotations

from datetime import UTC, datetime
from fnmatch import fnmatch
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Response, status
from starlette.concurrency import run_in_threadpool

from app.api.deps import AdminUser, SessionDep
from app.core.config import settings
from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.models.user import User
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import admin as service

log = get_logger(__name__)

router = APIRouter(prefix="/admin", tags=["администрирование"])


# --- сотрудники ---------------------------------------------------------------


@router.get("/users", response_model=list[UserRead], summary="Пользователи")
async def list_users(session: SessionDep, _: AdminUser) -> list[User]:
    return await service.list_users(session)


@router.post(
    "/users", response_model=UserRead, status_code=status.HTTP_201_CREATED, summary="Создать"
)
async def create_user(payload: UserCreate, session: SessionDep, _: AdminUser) -> User:
    return await service.create_user(session, payload)


@router.patch("/users/{user_id}", response_model=UserRead, summary="Изменить")
async def update_user(user_id: int, payload: UserUpdate, session: SessionDep, _: AdminUser) -> User:
    return await service.update_user(session, user_id, payload)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить")
async def delete_user(user_id: int, session: SessionDep, current: AdminUser) -> None:
    """Удаляет сотрудника, передавая его лиды администратору (детали — в сервисе)."""
    await service.delete_user(session, current=current, user_id=user_id)


# --- безопасность -------------------------------------------------------------


@router.get("/backups", summary="Список резервных копий")
async def list_backups(_: AdminUser) -> dict[str, Any]:
    """Файлы из каталога бэкапов + признак «копия устарела»."""
    from app.api.v1.attachments import disk_usage

    # Чтение каталога — блокирующие вызовы, выносим в пул потоков.
    results, last_mtime = await run_in_threadpool(service.scan_backups, Path(settings.backup_dir))
    age_hours = service.backup_age_hours(last_mtime)

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


@router.delete("/backups/{name}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить копию")
async def delete_backup(name: str, admin: AdminUser) -> Response:
    """Удаляет файл резервной копии из каталога бэкапов.

    Принимаются только настоящие имена из списка копий (шаблон ``crm-*.dump``,
    без обходных путей) — удалить что-либо вне каталога копий невозможно.
    Какую копию удалять, решает администратор (в том числе самую свежую):
    ночная задача продолжит создавать новые, место освобождается сразу.
    """
    if not fnmatch(name, "crm-*.dump") or "/" in name or "\\" in name:
        raise NotFoundError(f"Резервная копия {name} не найдена")
    directory = Path(settings.backup_dir).resolve()
    path = (directory / name).resolve()
    if path.parent != directory or not path.is_file():
        raise NotFoundError(f"Резервная копия {name} не найдена")
    await run_in_threadpool(path.unlink)
    log.info("backup.deleted", name=name, by=admin.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/login-attempts", summary="Неудачные попытки входа")
async def get_login_attempts(session: SessionDep, _: AdminUser) -> list[dict[str, Any]]:
    """Сгруппировано по паре «учётная запись + IP», сверху самые свежие."""
    return await service.login_attempts(session)
