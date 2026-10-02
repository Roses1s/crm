"""Проверки воркера Celery.

Эти тесты закрывают дыру, из-за которой воркер падал на сервере: сами задачи
в pytest не выполняются, но модуль с ними должен импортироваться ровно так же,
как это делает `celery worker` при старте, а синхронный драйвер БД — быть
установленным.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.base import Base
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
        "app.worker.tasks.cleanup_orphan_attachments",
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
