"""Структурное логирование через structlog.

В продакшене логи пишутся JSON-строками — их удобно собирать и искать.
Локально — цветным человекочитаемым выводом.
"""

from __future__ import annotations

import logging
import sys
from typing import Any

import structlog

from app.core.config import settings


def configure_logging() -> None:
    # Процессоры берём из structlog.processors, а не structlog.stdlib: наш
    # логгер — PrintLogger, и у него нет атрибута .name, который ждёт
    # stdlib-вариант.
    processors: list[Any] = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
    ]
    if settings.log_json:
        processors.append(structlog.processors.JSONRenderer())
    else:
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            logging.getLevelNamesMapping().get(settings.log_level.upper(), logging.INFO)
        ),
        logger_factory=structlog.PrintLoggerFactory(file=sys.stdout),
        cache_logger_on_first_use=True,
    )

    # Чужие логгеры (uvicorn, gunicorn) перенаправляем в общий поток и
    # формат: иначе часть записей выглядела бы иначе и терялась при разборе.
    logging.basicConfig(
        format="%(message)s",
        stream=sys.stdout,
        level=settings.log_level.upper(),
    )
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access", "gunicorn.error"):
        logging.getLogger(name).handlers.clear()
        logging.getLogger(name).propagate = True


def get_logger(name: str | None = None) -> Any:
    """Логгер с именем модуля в поле logger."""
    logger = structlog.get_logger()
    return logger.bind(logger=name) if name else logger
