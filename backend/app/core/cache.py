"""Кеш ответов (fastapi-cache2 поверх Valkey).

Если Valkey недоступен — приложение не падает, а переходит на кеш в памяти
процесса: для локальной разработки и тестов этого достаточно.
"""

from __future__ import annotations

from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from fastapi_cache.backends.redis import RedisBackend
from redis import asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)


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
