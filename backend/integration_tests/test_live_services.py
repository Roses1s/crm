"""Проверки настоящих Valkey, ограничителя частоты и Celery worker.

Запускаются отдельно в CI с PostgreSQL и Valkey; обычный быстрый набор
тестов эти сервисы не подменяет и не запускает.
"""

from __future__ import annotations

import asyncio
import os
from uuid import uuid4

import pytest
from fastapi_cache import FastAPICache
from fastapi_cache.backends.redis import RedisBackend
from httpx import ASGITransport, AsyncClient
from limits.storage.redis import RedisStorage

from app.core.cache import init_cache
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.security import hash_password
from app.db.base import Base
from app.db.session import SessionLocal, engine
from app.main import app
from app.models.crm import Tag
from app.models.user import Role, User
from app.worker.celery_app import celery

pytestmark = pytest.mark.skipif(
    os.getenv("RUN_SERVICE_INTEGRATION") != "1",
    reason="Нужны PostgreSQL, Valkey и запущенный Celery worker",
)


async def test_live_valkey_rate_limiter_and_celery_worker() -> None:
    """Кеш, лимитер и фоновая задача работают через реальные сервисы."""
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.drop_all)
        await connection.run_sync(Base.metadata.create_all)

    cache_backend: RedisBackend | None = None
    try:
        FastAPICache.reset()
        await init_cache()
        backend = FastAPICache.get_backend()
        if not isinstance(backend, RedisBackend):
            pytest.fail("Приложение перешло на кеш в памяти вместо Valkey")
        cache_backend = backend
        assert await backend.redis.ping()
        assert settings.rate_limit_enabled
        assert settings.rate_limit_login == "3/minute"
        assert isinstance(limiter._storage, RedisStorage)

        async with SessionLocal() as session:
            admin = User(
                email="integration-admin@crmdetroid.ru",
                hashed_password=hash_password("IntegrationOnly123"),
                first_name="Тест",
                last_name="Интеграционный",
                role=Role.admin,
            )
            tag = Tag(name="Интеграционный тег", color="#112233")
            session.add_all([admin, tag])
            await session.commit()
            tag_id = tag.id

        cache_ip = f"198.51.100.{uuid4().int % 254 + 1}"
        cache_transport = ASGITransport(app=app, client=(cache_ip, 42001))
        async with AsyncClient(transport=cache_transport, base_url="http://testserver") as client:
            login = await client.post(
                "/api/v1/auth/login",
                json={"email": "integration-admin@crmdetroid.ru", "password": "IntegrationOnly123"},
            )
            assert login.status_code == 200, login.text
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

            first = await client.get("/api/v1/crm/tags", headers=headers)
            second = await client.get("/api/v1/crm/tags", headers=headers)
            assert first.headers.get("x-fastapi-cache") == "MISS"
            assert second.headers.get("x-fastapi-cache") == "HIT"
            assert second.json()[0]["color"] == "#112233"

            changed = await client.patch(
                f"/api/v1/crm/tags/{tag_id}",
                json={"color": "#abcdef"},
                headers=headers,
            )
            assert changed.status_code == 200, changed.text
            refreshed = await client.get("/api/v1/crm/tags", headers=headers)
            assert refreshed.headers.get("x-fastapi-cache") == "MISS"
            assert refreshed.json()[0]["color"] == "#abcdef"

        limit_ip = f"203.0.113.{uuid4().int % 254 + 1}"
        limit_transport = ASGITransport(app=app, client=(limit_ip, 42002))
        async with AsyncClient(transport=limit_transport, base_url="http://testserver") as client:
            statuses = []
            for _ in range(4):
                response = await client.post(
                    "/api/v1/auth/login",
                    json={"email": "unknown@crmdetroid.ru", "password": "WrongPassword123"},
                )
                statuses.append(response.status_code)
            assert statuses == [401, 401, 401, 429]

        assert await backend.redis.keys("LIMITS:*")
        assert not limiter._storage_dead

        task = celery.send_task("app.worker.tasks.cleanup_login_attempts")
        try:
            result = await asyncio.to_thread(task.get, timeout=30)
        finally:
            task.forget()
        assert result == {"removed": 0}
    finally:
        if cache_backend is not None:
            await FastAPICache.clear(namespace="tags")
            await cache_backend.redis.aclose()
        FastAPICache.reset()
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.drop_all)
        await engine.dispose()
