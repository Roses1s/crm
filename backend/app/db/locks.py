"""Транзакционные блокировки PostgreSQL для проверок «сначала прочитать, потом записать»."""

from __future__ import annotations

from sqlalchemy import Integer, String, bindparam, text
from sqlalchemy.ext.asyncio import AsyncSession


async def advisory_xact_lock(session: AsyncSession, *, namespace: int, key: str) -> None:
    """Блокирует ключ до завершения транзакции; в SQLite ничего не делает.

    Хеширование выполняет PostgreSQL. Совпадение хешей разных ключей может
    только лишний раз сериализовать запросы, но не ослабляет защиту.
    """
    bind = session.bind
    if bind is None or bind.dialect.name != "postgresql":
        return
    statement = text("SELECT pg_advisory_xact_lock(:namespace, hashtext(:key))").bindparams(
        bindparam("namespace", type_=Integer()),
        bindparam("key", type_=String()),
    )
    await session.execute(statement, {"namespace": namespace, "key": key})
