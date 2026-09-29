"""Проверки воркера Celery.

Эти тесты закрывают дыру, из-за которой воркер падал на сервере: сами задачи
в pytest не выполняются, но модуль с ними должен импортироваться ровно так же,
как это делает `celery worker` при старте, а синхронный драйвер БД — быть
установленным.
"""

from __future__ import annotations

from sqlalchemy import create_engine

from app.core.config import settings


def test_celery_imports_task_modules() -> None:
    """Повторяет загрузку задач при старте воркера."""
    from app.worker.celery_app import celery

    celery.loader.import_default_modules()
    registered = {name for name in celery.tasks if name.startswith("app.")}
    assert registered == {
        "app.worker.tasks.backup_database",
        "app.worker.tasks.cleanup_orphan_attachments",
        "app.worker.tasks.send_call_reminders",
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
