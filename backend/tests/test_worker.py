"""Проверки воркера Celery.

Эти тесты закрывают дыру, из-за которой воркер падал на сервере: сами задачи
в pytest не выполняются, но модуль с ними должен импортироваться ровно так же,
как это делает `celery worker` при старте, а синхронный драйвер БД — быть
установленным.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from sqlalchemy import create_engine

from app.core.config import settings
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
