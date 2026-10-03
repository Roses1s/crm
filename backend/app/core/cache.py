"""Кеш ответов (fastapi-cache2 поверх Valkey).

Если Valkey недоступен — приложение не падает, а переходит на кеш в памяти
процесса: для локальной разработки и тестов этого достаточно.

Кешируем ТОЛЬКО глобальные справочники, одинаковые для всех пользователей
(теги, причины проигрыша). Данные, зависящие от пользователя (лиды, воронки,
заявки), не кешируются: это и риск утечки между аккаунтами, и лишняя
рассинхронизация.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from typing import Any

from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.backends.redis import RedisBackend
from redis import asyncio as aioredis
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)


def public_key_builder(
    func: Callable[..., Any],
    namespace: str = "",
    *,
    request: Request | None = None,
    response: Response | None = None,
    args: tuple[Any, ...] = (),
    kwargs: dict[str, Any] | None = None,
) -> str:
    """Ключ кеша ТОЛЬКО по пути и query-параметрам запроса.

    Стандартный ключ fastapi-cache учитывает все аргументы функции, включая
    внедрённые зависимости (сессию БД, пользователя). Их ``repr`` содержит адрес
    объекта и меняется на каждый запрос — из-за этого кеш никогда не срабатывает.
    Здесь берём только путь и query, поэтому применять этот builder можно
    ИСКЛЮЧИТЕЛЬНО к глобальным справочникам, одинаковым для всех пользователей.
    Для данных, зависящих от пользователя, он привёл бы к утечке между аккаунтами.
    """
    path = request.url.path if request else ""
    query = request.url.query if request else ""
    raw = f"{func.__module__}:{func.__name__}:{path}:{query}"
    digest = hashlib.md5(raw.encode(), usedforsecurity=False).hexdigest()
    return f"{namespace}:{digest}"


async def invalidate(namespace: str) -> None:
    """Сбрасывает кеш пространства имён после изменения справочника.

    Молча пропускает вызов, если кеш ещё не инициализирован (например, вне
    жизненного цикла приложения) — чтобы правки данных не падали из-за кеша.
    """
    try:
        await FastAPICache.clear(namespace=namespace)
    except Exception as exc:  # кеш не должен ломать основную операцию
        log.warning("cache.invalidate_failed", namespace=namespace, error=str(exc))


async def init_cache() -> None:
    try:
        client = aioredis.from_url(  # type: ignore[no-untyped-call]
            settings.valkey_url, encoding="utf8", decode_responses=False
        )
        await client.ping()
        FastAPICache.init(RedisBackend(client), prefix="crm-cache")
        log.info("cache.init", backend="valkey", url=settings.valkey_url)
    except Exception as exc:
        FastAPICache.init(InMemoryBackend(), prefix="crm-cache")
        log.warning("cache.fallback_inmemory", error=str(exc))


async def close_cache() -> None:
    await FastAPICache.clear()
