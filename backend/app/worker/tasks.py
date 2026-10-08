"""Задачи Celery: бэкапы и уборка.

Что делает воркер:
  * `backup_database` — ночной дамп PostgreSQL;
  * `backup_attachments` — еженедельный архив вложений;
  * `cleanup_orphan_attachments` — убирает записи о файлах, которых нет на диске;
  * `cleanup_revoked_tokens` — чистит чёрный список токенов от истёкших записей;
  * `cleanup_login_attempts` — убирает старые записи журнала попыток входа;
  * `cleanup_orphan_files` — удаляет файлы на диске, которых нет в базе.

Расписание задано в `app/worker/celery_app.py`.

Задачи синхронные (так проще и надёжнее в воркере), поэтому для доступа
к базе используется отдельный синхронный движок SQLAlchemy.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import tarfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, cast

from celery import shared_task
from sqlalchemy import CursorResult, Engine, create_engine, delete, select
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app.core.attachment_paths import thumbnail_path
from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.models.security import LoginAttempt, RevokedToken
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


def _pg_dump_command(target: Path) -> tuple[list[str], dict[str, str]]:
    """Команда pg_dump и окружение так, чтобы пароль НЕ попал в аргументы.

    Пароль в аргументах командной строки виден в списке процессов (`ps aux`) и
    может утечь в логи. Поэтому параметры подключения передаём отдельными флагами,
    а пароль — только через переменную окружения PGPASSWORD, которую понимает libpq.
    """
    url = make_url(settings.plain_dsn)
    cmd = ["pg_dump", "--format=custom", "--no-owner"]
    if url.host:
        cmd += ["--host", url.host]
    if url.port:
        cmd += ["--port", str(url.port)]
    if url.username:
        cmd += ["--username", url.username]
    cmd += ["--file", str(target), "--dbname", url.database or ""]

    env = dict(os.environ)
    if url.password:
        env["PGPASSWORD"] = url.password
    return cmd, env


@shared_task(name="app.worker.tasks.backup_database")
def backup_database() -> dict[str, Any]:
    """Ночной дамп базы через pg_dump. Хранит копии 14 дней."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(tz=UTC).strftime("%Y-%m-%d-%H%M")
    target = BACKUP_DIR / f"crm-{stamp}.dump"

    if shutil.which("pg_dump") is None:
        log.error("backup.no_pg_dump")
        return {"ok": False, "error": "pg_dump не установлен в образе"}

    cmd, env = _pg_dump_command(target)
    result = subprocess.run(
        cmd,
        env=env,
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
        # В архив входят оригиналы и уже созданные WebP-миниатюры. При
        # восстановлении пустые кеши также будут автоматически пересозданы.
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


# Размер одной партии при постраничном проходе cleanup_orphan_attachments.
_CLEANUP_BATCH_SIZE = 500


@shared_task(name="app.worker.tasks.cleanup_orphan_attachments")
def cleanup_orphan_attachments() -> dict[str, Any]:
    """Удаляет записи о файлах, которых уже нет на диске.

    Раньше весь список вложений вычитывался одним `select()` целиком — на
    базе с большим архивом это разом съедало память воркера и держало одну
    длинную транзакцию открытой. Теперь идём по таблице партиями по id
    (keyset-пагинация, не OFFSET — тот на больших смещениях деградирует по
    скорости) и коммитим после каждой партии.
    """
    removed = 0
    last_id = 0
    with _session() as session:
        while True:
            batch = list(
                session.execute(
                    select(Attachment)
                    .where(Attachment.id > last_id)
                    .order_by(Attachment.id)
                    .limit(_CLEANUP_BATCH_SIZE)
                ).scalars()
            )
            if not batch:
                break
            last_id = batch[-1].id
            for attachment in batch:
                if attachment.storage_path and not Path(attachment.storage_path).exists():
                    session.delete(attachment)
                    removed += 1
            session.commit()
    log.info("cleanup.attachments", removed=removed)
    return {"removed": removed}


@shared_task(name="app.worker.tasks.cleanup_revoked_tokens")
def cleanup_revoked_tokens() -> dict[str, Any]:
    """Чистит чёрный список токенов от записей, срок которых уже истёк.

    Такая запись бесполезна: сам токен к этому моменту всё равно недействителен.
    """
    now = datetime.now(tz=UTC)
    with _session() as session:
        expired = list(
            session.execute(select(RevokedToken).where(RevokedToken.expires_at < now)).scalars()
        )
        for token in expired:
            session.delete(token)
        session.commit()
    log.info("cleanup.revoked_tokens", removed=len(expired))
    return {"removed": len(expired)}


@shared_task(name="app.worker.tasks.cleanup_login_attempts")
def cleanup_login_attempts() -> dict[str, Any]:
    """Чистит журнал попыток входа от старых записей.

    Таблица пополняется при каждом входе и раньше не чистилась вообще: на
    диске в 15 ГБ это медленная, но верная утечка места. Срок хранения —
    `LOGIN_ATTEMPTS_KEEP_DAYS` (по умолчанию 90 дней): этого достаточно, чтобы
    разобраться в подозрительной активности, и немного для объёма.
    """
    cutoff = datetime.now(tz=UTC) - timedelta(days=settings.login_attempts_keep_days)
    with _session() as session:
        # CursorResult даёт rowcount; аннотация execute() о нём не знает.
        result = cast(
            "CursorResult[Any]",
            session.execute(delete(LoginAttempt).where(LoginAttempt.created_at < cutoff)),
        )
        removed_rows = result.rowcount
        session.commit()
    removed = int(removed_rows or 0)
    log.info("cleanup.login_attempts", removed=removed)
    return {"removed": removed}


@shared_task(name="app.worker.tasks.cleanup_orphan_files")
def cleanup_orphan_files() -> dict[str, Any]:
    """Удаляет файлы на диске, которым не соответствует запись в базе.

    Обратная задача к `cleanup_orphan_attachments`. Такие файлы остаются после
    прерванной загрузки, отката транзакции и удаления примечания вместе с
    вложениями (строки уходят каскадом, файлы — нет). Ни в одном интерфейсе
    они не видны и занимают место бесконечно. WebP-миниатюры не имеют своей
    строки в базе: их сохраняем только пока существует оригинал и удаляем
    вместе с сиротским вложением.

    Чтобы не удалить файл, который прямо сейчас дописывается, трогаем только
    то, что старше часа.
    """
    root = Path(settings.attachments_dir)
    if not root.exists():
        return {"removed": 0, "freed_bytes": 0}

    cutoff = (datetime.now(tz=UTC) - timedelta(hours=1)).timestamp()
    with _session() as session:
        known: set[str] = set()
        for (path,) in session.execute(select(Attachment.storage_path)).all():
            if not path:
                continue
            original = Path(path)
            known.add(str(original))
            # Миниатюра — производный кеш, в таблице отдельной строки для неё
            # нет. Сохраняем sidecar, пока существует исходное вложение.
            known.add(str(thumbnail_path(original)))

    removed = 0
    freed = 0
    for file in root.rglob("*"):
        if not file.is_file() or str(file) in known or file.stat().st_mtime > cutoff:
            continue
        freed += file.stat().st_size
        file.unlink(missing_ok=True)
        removed += 1

    log.info("cleanup.orphan_files", removed=removed, freed_bytes=freed)
    return {"removed": removed, "freed_bytes": freed}
