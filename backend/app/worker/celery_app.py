"""Celery: фоновые и периодические задачи.

Брокер и бэкенд результатов — Valkey (протокол совместим с Redis).
Запуск воркера:   celery -A app.worker.celery_app.celery worker -l info
Запуск планировщика: celery -A app.worker.celery_app.celery beat -l info
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery = Celery(
    "crm",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.worker.tasks"],
)

celery.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="Europe/Moscow",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_time_limit=600,
    task_soft_time_limit=540,
    result_expires=3600,
    broker_connection_retry_on_startup=True,
)

celery.conf.beat_schedule = {
    "nightly-backup": {
        "task": "app.worker.tasks.backup_database",
        "schedule": crontab(hour=3, minute=0),
    },
    "call-reminders": {
        "task": "app.worker.tasks.send_call_reminders",
        "schedule": crontab(hour=9, minute=0),
    },
    "weekly-files-backup": {
        "task": "app.worker.tasks.backup_attachments",
        "schedule": crontab(hour=4, minute=0, day_of_week="sun"),
    },
    "cleanup-attachments": {
        "task": "app.worker.tasks.cleanup_orphan_attachments",
        "schedule": crontab(hour=4, minute=30, day_of_week="sun"),
    },
}
