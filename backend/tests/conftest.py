"""Общая обвязка тестов.

По умолчанию тесты идут на SQLite в памяти: не нужен ни Postgres, ни Valkey,
прогон занимает секунды. Но если задать переменную окружения
``TEST_DATABASE_URL`` (например, на настоящий PostgreSQL), тот же набор тестов
прогонится на этой базе — так в CI мы ловим отличия поведения PostgreSQL от
SQLite. Схема создаётся из моделей; миграции проверяются отдельным шагом
``alembic upgrade head`` на настоящем PostgreSQL.

Тестовый HTTP-клиент переиспользует одну ``AsyncSession`` для всех запросов
внутри теста; в рабочем приложении зависимость создаёт отдельную сессию на
каждый запрос. Это упрощает тестовые данные, но не проверяет жизненный цикл сессии
и восстановление после ошибки транзакции (остаток Т-03).
"""

from __future__ import annotations

import os
import shutil
import tempfile
from collections.abc import AsyncGenerator

# Куда указывать тестовую базу. По умолчанию — SQLite в памяти.
# В CI на шаге «тесты на PostgreSQL» сюда приходит DSN сервиса postgres.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
_IS_SQLITE = TEST_DATABASE_URL.startswith("sqlite")

# Переменные окружения выставляются ДО импорта приложения.
# Вложения в тестах пишутся во временный каталог, который чистится после прогона.
_ATTACHMENTS_TMP = tempfile.mkdtemp(prefix="crm-test-attachments-")

# Тесты не подключают Valkey/Celery: кеш заменён памятью, лимитер выключен.
# Это ускоряет обычный прогон, но оставляет интеграционные проверки Т-06.
os.environ.update(
    DATABASE_URL=TEST_DATABASE_URL,
    ATTACHMENTS_DIR=_ATTACHMENTS_TMP,
    MAX_UPLOAD_MB="1",
    SECRET_KEY="test-secret",
    RATE_LIMIT_ENABLED="false",
    LOG_JSON="false",
    LOG_LEVEL="WARNING",
    ENVIRONMENT="local",
)

import pytest
from fastapi_cache import FastAPICache
from fastapi_cache.backends.inmemory import InMemoryBackend
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool, StaticPool

from app.core.security import hash_password
from app.db.base import Base
from app.db.session import get_session
from app.main import app
from app.models.crm import Lead, LossReason, Stage, Tag
from app.models.user import Role, User

TEST_PASSWORD = "SuperSecret123"


@pytest.fixture(autouse=True)
def _clean_attachments() -> AsyncGenerator[None, None]:  # type: ignore[misc]
    """Каждый тест начинает с пустым каталогом вложений."""
    shutil.rmtree(_ATTACHMENTS_TMP, ignore_errors=True)
    os.makedirs(_ATTACHMENTS_TMP, exist_ok=True)
    yield
    shutil.rmtree(_ATTACHMENTS_TMP, ignore_errors=True)


@pytest.fixture(autouse=True)
async def _cache() -> AsyncGenerator[None, None]:
    """Кеш в памяти: lifespan приложения в тестах не выполняется."""
    FastAPICache.init(InMemoryBackend(), prefix="test-cache")
    yield
    await FastAPICache.clear()


@pytest.fixture
async def engine() -> AsyncGenerator:
    if _IS_SQLITE:
        # StaticPool + одно соединение: иначе каждая сессия получит свою пустую БД.
        test_engine = create_async_engine(
            TEST_DATABASE_URL,
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
    else:
        # На настоящей базе (PostgreSQL) соединения не переиспользуем между
        # тестами, чтобы не тащить состояние: NullPool закрывает их сразу.
        test_engine = create_async_engine(TEST_DATABASE_URL, poolclass=NullPool)

    async with test_engine.begin() as conn:
        # На постоянной базе таблицы могли остаться от прошлого теста —
        # начинаем с чистого листа. Для SQLite в памяти это безвредный no-op.
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield test_engine
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest.fixture
async def session(engine) -> AsyncGenerator[AsyncSession, None]:
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as s:
        yield s


@pytest.fixture
async def seeded(session: AsyncSession) -> dict[str, object]:
    """Минимальный набор данных: админ, менеджер, этапы, тег, лид."""
    admin = User(
        email="admin@crmdetroid.ru",
        hashed_password=hash_password(TEST_PASSWORD),
        first_name="Артём",
        last_name="Соколов",
        role=Role.admin,
    )
    manager = User(
        email="manager@crmdetroid.ru",
        hashed_password=hash_password(TEST_PASSWORD),
        first_name="Денис",
        last_name="Кузнецов",
        role=Role.manager,
    )
    session.add_all([admin, manager])
    await session.flush()

    # Этапы принадлежат доске админа — как после перехода на личные воронки.
    new_stage = Stage(name="Новый", sequence=1, color="slate", owner_id=admin.id)
    talks_stage = Stage(name="Переговоры", sequence=2, color="blue", owner_id=admin.id)
    tag = Tag(name="Крупный клиент", color="#1e8449")
    loss_reason = LossReason(name="Перестал возить")
    session.add_all([new_stage, talks_stage, tag, loss_reason])
    await session.flush()

    lead = Lead(
        name="ООО «Уралпромснаб»",
        inn="7451234565",
        logist_contact="Громов Сергей",
        priority=3,
        stage_id=new_stage.id,
        assigned_to_id=admin.id,
    )
    lead.tags = [tag]
    session.add(lead)
    await session.commit()

    return {
        "admin": admin,
        "manager": manager,
        "stage_new": new_stage,
        "stage_talks": talks_stage,
        "tag": tag,
        "lead": lead,
        "loss_reason": loss_reason,
    }


@pytest.fixture
async def client(session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP-клиент теста: все запросы используют одну сессию (ограничение Т-03)."""

    async def _override() -> AsyncGenerator[AsyncSession, None]:
        yield session

    app.dependency_overrides[get_session] = _override
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def auth_client(client: AsyncClient, seeded: dict[str, object]) -> AsyncClient:
    """Клиент с access-токеном администратора."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    client.headers["Authorization"] = f"Bearer {token}"
    return client
