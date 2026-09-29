"""Задачи Celery.

Задачи синхронные (так проще и надёжнее в воркере), поэтому для доступа
к базе используется отдельный синхронный движок SQLAlchemy.
"""

from __future__ import annotations

import shutil
import subprocess
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from celery import shared_task
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.models.crm import Lead
from app.models.timeline import Attachment

configure_logging()
log = get_logger("worker")

BACKUP_DIR = Path(settings.backup_dir)

_sync_engine = create_engine(settings.alembic_dsn, pool_pre_ping=True, future=True)
SyncSession: sessionmaker[Session] = sessionmaker(bind=_sync_engine, expire_on_commit=False)


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
        ["pg_dump", "--format=custom", "--no-owner", "--file", str(target), settings.alembic_dsn],
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


@shared_task(name="app.worker.tasks.send_call_reminders")
def send_call_reminders() -> dict[str, Any]:
    """Напоминания о звонках, запланированных на сегодня."""
    today = date.today()
    with SyncSession() as session:
        leads = list(
            session.execute(
                select(Lead).where(
                    Lead.next_call_date == today,
                    Lead.is_archived.is_(False),
                )
            )
            .unique()
            .scalars()
        )
    for lead in leads:
        # Здесь появится отправка в почту/телеграм — пока только журнал.
        log.info(
            "reminder.call",
            lead_id=lead.id,
            lead=lead.name,
            assigned_to=lead.assigned_to_id,
        )
    return {"reminders": len(leads), "date": today.isoformat()}


@shared_task(name="app.worker.tasks.cleanup_orphan_attachments")
def cleanup_orphan_attachments() -> dict[str, Any]:
    """Удаляет записи о файлах, которых уже нет на диске."""
    removed = 0
    with SyncSession() as session:
        attachments = list(session.execute(select(Attachment)).scalars())
        for attachment in attachments:
            if attachment.storage_path and not Path(attachment.storage_path).exists():
                session.delete(attachment)
                removed += 1
        session.commit()
    log.info("cleanup.attachments", removed=removed)
    return {"removed": removed}
