"""Задачи Celery.

Задачи синхронные (так проще и надёжнее в воркере), поэтому для доступа
к базе используется отдельный синхронный движок SQLAlchemy.
"""

from __future__ import annotations

import shutil
import subprocess
import tarfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from celery import shared_task
from sqlalchemy import Engine, create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.models.timeline import Attachment

configure_logging()
log = get_logger("worker")

BACKUP_DIR = Path(settings.backup_dir)

# Движок создаётся при первом обращении, а не при импорте модуля: иначе любая
# проблема с драйвером роняла бы воркер ещё до старта Celery.
_sync_engine: Engine | None = None


def _session() -> Session:
    global _sync_engine
    if _sync_engine is None:
        _sync_engine = create_engine(settings.sync_dsn, pool_pre_ping=True, future=True)
    return Session(_sync_engine, expire_on_commit=False)


@shared_task(name="app.worker.tasks.backup_database")
def backup_database() -> dict[str, Any]:
    """Ночной дамп базы через pg_dump. Хранит копии 14 дней."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=UTC).strftime("%Y-%m-%d-%H%M")
    target = BACKUP_DIR / f"crm-{stamp}.dump"

    if shutil.which("pg_dump") is None:
        log.error("backup.no_pg_dump")
        return {"ok": False, "error": "pg_dump не установлен в образе"}

    result = subprocess.run(
        ["pg_dump", "--format=custom", "--no-owner", "--file", str(target), settings.plain_dsn],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        error = result.stderr.strip()[:500]
        # Частый случай: клиент старее сервера — дамп снять нельзя.
        if "server version" in error:
            error += " | нужен postgresql-client той же мажорной версии, что и сервер"
        log.error("backup.failed", stderr=error)
        target.unlink(missing_ok=True)
        return {"ok": False, "error": error}

    cutoff = datetime.now(tz=UTC) - timedelta(days=settings.backup_keep_days)
    removed = 0
    for old in BACKUP_DIR.glob("crm-*.dump"):
        if datetime.fromtimestamp(old.stat().st_mtime, tz=UTC) < cutoff:
            old.unlink()
            removed += 1

    size = target.stat().st_size
    log.info("backup.ok", file=target.name, size=size, removed_old=removed)
    return {"ok": True, "file": target.name, "size": size}


@shared_task(name="app.worker.tasks.backup_attachments")
def backup_attachments() -> dict[str, Any]:
    """Архив вложений. Дамп базы файлы не содержит, поэтому копим отдельно
    и реже: файлы меняются медленно, а место на диске не бесконечное."""
    source = Path(settings.attachments_dir)
    if not source.exists() or not any(source.rglob("*")):
        log.info("backup.files.empty")
        return {"ok": True, "skipped": "вложений нет"}

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=UTC).strftime("%Y-%m-%d-%H%M")
    target = BACKUP_DIR / f"files-{stamp}.tar.gz"

    with tarfile.open(target, "w:gz") as archive:
        archive.add(source, arcname="attachments")

    # Оставляем только N последних архивов файлов.
    archives = sorted(BACKUP_DIR.glob("files-*.tar.gz"), key=lambda f: f.stat().st_mtime)
    removed = 0
    for old in archives[: max(0, len(archives) - settings.backup_files_keep)]:
        old.unlink()
        removed += 1

    size = target.stat().st_size
    log.info("backup.files.ok", file=target.name, size=size, removed_old=removed)
    return {"ok": True, "file": target.name, "size": size}


@shared_task(name="app.worker.tasks.cleanup_orphan_attachments")
def cleanup_orphan_attachments() -> dict[str, Any]:
    """Удаляет записи о файлах, которых уже нет на диске."""
    removed = 0
    with _session() as session:
        attachments = list(session.execute(select(Attachment)).scalars())
        for attachment in attachments:
            if attachment.storage_path and not Path(attachment.storage_path).exists():
                session.delete(attachment)
                removed += 1
        session.commit()
    log.info("cleanup.attachments", removed=removed)
    return {"removed": removed}
