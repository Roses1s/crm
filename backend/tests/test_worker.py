"""Проверки воркера Celery.

Эти тесты закрывают дыру, из-за которой воркер падал на сервере: сами задачи
в pytest не выполняются, но модуль с ними должен импортироваться ровно так же,
как это делает `celery worker` при старте, а синхронный драйвер БД — быть
установленным.
"""

from __future__ import annotations

import os
import tarfile
import time
from datetime import UTC, datetime, timedelta
from pathlib import Path
from unittest import mock

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.attachment_paths import thumbnail_path
from app.core.config import settings
from app.db.base import Base
from app.models.security import LoginAttempt
from app.models.timeline import Attachment
from app.worker import tasks as worker_tasks
from app.worker.tasks import _pg_dump_command


def test_celery_imports_task_modules() -> None:
    """Повторяет загрузку задач при старте воркера."""
    from app.worker.celery_app import celery

    celery.loader.import_default_modules()
    registered = {name for name in celery.tasks if name.startswith("app.")}
    assert registered == {
        "app.worker.tasks.backup_attachments",
        "app.worker.tasks.backup_database",
        "app.worker.tasks.cleanup_login_attempts",
        "app.worker.tasks.cleanup_orphan_attachments",
        "app.worker.tasks.cleanup_orphan_files",
        "app.worker.tasks.cleanup_revoked_tokens",
    }


def test_beat_schedule_is_configured() -> None:
    from app.worker.celery_app import celery

    tasks = {entry["task"] for entry in celery.conf.beat_schedule.values()}
    assert "app.worker.tasks.backup_database" in tasks


def test_sync_postgres_driver_is_installed() -> None:
    """У Celery нет цикла событий: asyncpg не подойдёт, нужен psycopg 3.

    create_engine импортирует DBAPI-модуль, но никуда не подключается —
    поэтому тест не требует работающей базы.
    """
    engine = create_engine("postgresql+psycopg://user:pass@localhost:5432/db")
    assert engine.dialect.driver == "psycopg"


def test_dsn_variants_do_not_leak_drivers() -> None:
    """pg_dump понимает только чистый URL, без +asyncpg и +psycopg."""
    assert "+" not in settings.plain_dsn.split("://", 1)[0]


def test_cleanup_orphan_attachments_paginates_and_removes_orphans(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Раньше весь список вложений вычитывался одним select(); здесь проверяем,
    что постраничный проход (keyset-пагинация по id) всё так же находит и
    удаляет все "осиротевшие" записи, а не только первую партию."""
    db_path = tmp_path / "cleanup.db"
    engine = create_engine(f"sqlite:///{db_path}", future=True)
    Base.metadata.create_all(engine)

    existing_file = tmp_path / "real.txt"
    existing_file.write_text("содержимое")

    with Session(engine) as session:
        for i in range(5):
            # Чётные — указывают на существующий файл, нечётные — на удалённый.
            path = existing_file if i % 2 == 0 else tmp_path / f"missing-{i}.txt"
            session.add(
                Attachment(
                    lead_id=1,
                    name=f"file-{i}",
                    size=1,
                    content_type="text/plain",
                    storage_path=str(path),
                )
            )
        session.commit()

    monkeypatch.setattr(settings, "database_url", f"sqlite+aiosqlite:///{db_path}")
    monkeypatch.setattr(worker_tasks, "_sync_engine", None)
    # Партии по 2 при пяти записях — минимум три прохода цикла, иначе
    # регрессия "обработали только первую страницу" прошла бы тест незамеченной.
    monkeypatch.setattr(worker_tasks, "_CLEANUP_BATCH_SIZE", 2)

    try:
        result = worker_tasks.cleanup_orphan_attachments()
    finally:
        worker_tasks._sync_engine = None

    assert result == {"removed": 2}
    with Session(engine) as session:
        remaining = session.execute(select(Attachment)).scalars().all()
    assert len(remaining) == 3
    assert all(a.storage_path == str(existing_file) for a in remaining)


def test_pg_dump_command_keeps_password_out_of_argv(monkeypatch: pytest.MonkeyPatch) -> None:
    """Пароль не должен попадать в аргументы pg_dump — только в PGPASSWORD.

    Иначе он виден в списке процессов (`ps aux`) любому на сервере.
    """
    monkeypatch.setattr(
        settings, "database_url", "postgresql+psycopg://crm:s3cr3t-pass@dbhost:5433/crmdb"
    )
    cmd, env = _pg_dump_command(Path("/tmp/crm.dump"))

    # Пароля нет ни в одном аргументе командной строки.
    assert all("s3cr3t-pass" not in arg for arg in cmd)
    # Пароль передаётся исключительно через окружение.
    assert env["PGPASSWORD"] == "s3cr3t-pass"
    # Параметры подключения переданы флагами.
    assert "--host" in cmd and "dbhost" in cmd
    assert "--port" in cmd and "5433" in cmd
    assert "--username" in cmd and "crm" in cmd
    assert "--dbname" in cmd and "crmdb" in cmd


def test_cleanup_orphan_files_removes_only_unknown_and_old(tmp_path: Path) -> None:
    """Файлы без записи в базе удаляются; свежие и известные — остаются.

    Такие файлы остаются после прерванной загрузки и после удаления
    примечания с вложениями (строки уходят каскадом, файлы — нет), и раньше
    лежали на диске вечно.
    """
    engine = create_engine(f"sqlite:///{tmp_path / 'files.db'}")
    Base.metadata.create_all(engine)

    storage = tmp_path / "attachments"
    storage.mkdir()
    known = storage / "известный.txt"
    known_thumbnail = thumbnail_path(known)
    orphan_old = storage / "сирота.txt"
    orphan_thumbnail = thumbnail_path(storage / "исходник-удалён.png")
    orphan_fresh = storage / "только-что-загружен.txt"
    for file in (known, known_thumbnail, orphan_old, orphan_thumbnail, orphan_fresh):
        file.write_bytes(b"x" * 10)

    # Старым файлам сдвигаем время изменения на сутки назад.
    day_ago = time.time() - 24 * 3600
    os.utime(known, (day_ago, day_ago))
    os.utime(known_thumbnail, (day_ago, day_ago))
    os.utime(orphan_old, (day_ago, day_ago))
    os.utime(orphan_thumbnail, (day_ago, day_ago))

    with Session(engine) as session:
        session.add(Attachment(lead_id=1, name="известный.txt", size=10, storage_path=str(known)))
        session.commit()

    with (
        mock.patch.object(worker_tasks, "_session", lambda: Session(engine)),
        mock.patch.object(settings, "attachments_dir", str(storage)),
    ):
        result = worker_tasks.cleanup_orphan_files()

    assert result["removed"] == 2
    assert known.exists()
    assert known_thumbnail.exists(), "миниатюра живого вложения не должна считаться сиротой"
    assert orphan_fresh.exists()
    assert not orphan_old.exists()
    assert not orphan_thumbnail.exists(), "миниатюру удалённого вложения нужно убрать"


def test_backup_attachments_includes_original_and_thumbnail(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Архив сохраняет оригиналы и миниатюры; обе версии переживают восстановление."""
    storage = tmp_path / "attachments"
    storage.mkdir()
    original = storage / "photo.jpg"
    original.write_bytes(b"original image")
    thumbnail = thumbnail_path(original)
    thumbnail.write_bytes(b"webp thumbnail")
    backup_dir = tmp_path / "backups"
    monkeypatch.setattr(settings, "attachments_dir", str(storage))
    monkeypatch.setattr(settings, "backup_files_keep", 3)
    monkeypatch.setattr(worker_tasks, "BACKUP_DIR", backup_dir)

    result = worker_tasks.backup_attachments()
    second_result = worker_tasks.backup_attachments()

    assert result["ok"] is True
    assert second_result["ok"] is True
    assert result["file"] != second_result["file"]
    with tarfile.open(backup_dir / result["file"], "r:gz") as archive:
        names = set(archive.getnames())
    assert "attachments/photo.jpg" in names
    assert f"attachments/{thumbnail.name}" in names


def test_cleanup_login_attempts_keeps_recent(tmp_path: Path) -> None:
    """Старые записи журнала входов удаляются, свежие остаются."""
    engine = create_engine(f"sqlite:///{tmp_path / 'attempts.db'}")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        session.add_all(
            [
                LoginAttempt(
                    email="old@crmdetroid.ru",
                    successful=False,
                    created_at=datetime.now(tz=UTC) - timedelta(days=400),
                ),
                LoginAttempt(
                    email="fresh@crmdetroid.ru",
                    successful=False,
                    created_at=datetime.now(tz=UTC),
                ),
            ]
        )
        session.commit()

    with mock.patch.object(worker_tasks, "_session", lambda: Session(engine)):
        result = worker_tasks.cleanup_login_attempts()

    assert result["removed"] == 1
    with Session(engine) as session:
        left = session.execute(select(LoginAttempt.email)).scalars().all()
    assert left == ["fresh@crmdetroid.ru"]
