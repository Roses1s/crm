"""Асинхронное подключение к базе."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import settings


def _engine_kwargs() -> dict[str, Any]:
    kwargs: dict[str, Any] = {"echo": settings.db_echo, "pool_pre_ping": True, "future": True}
    # У SQLite (тесты) нет пула соединений в привычном смысле.
    if not settings.sqlalchemy_dsn.startswith("sqlite"):
        kwargs |= {"pool_size": settings.db_pool_size, "max_overflow": settings.db_max_overflow}
    return kwargs


engine: AsyncEngine = create_async_engine(settings.sqlalchemy_dsn, **_engine_kwargs())

SessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """Зависимость FastAPI: сессия на запрос, откат при ошибке."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def dispose_engine() -> None:
    await engine.dispose()
