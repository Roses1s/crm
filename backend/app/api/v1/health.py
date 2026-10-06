"""Проверки живости и готовности сервиса."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from redis import asyncio as aioredis
from sqlalchemy import text

from app.api.deps import SessionDep
from app.core.config import settings
from app.core.logging import get_logger

log = get_logger(__name__)

router = APIRouter(tags=["health"])


@router.get("/health", summary="Жив ли процесс")
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "env": settings.environment}


@router.get("/health/ready", summary="Готов ли сервис принимать трафик")
async def readiness(session: SessionDep) -> JSONResponse:
    """Статус без подробностей: ручка доступна снаружи через общий прокси
    ``/api/``, и текст исключения (строка подключения, адрес базы) не должен
    покидать сервер — детали смотрят в журнале (ревью 03.10, Б-12)."""

    async def probe(name: str, check: Any) -> str:
        try:
            await check()
        except Exception as exc:
            log.error("health.probe_failed", probe=name, error=str(exc))
            return "error"
        return "ok"

    async def valkey_ping() -> None:
        client = aioredis.from_url(settings.valkey_url)  # type: ignore[no-untyped-call]
        try:
            await client.ping()
        finally:
            await client.aclose()

    checks: dict[str, str] = {
        "database": await probe("database", lambda: session.execute(text("SELECT 1"))),
        "valkey": await probe("valkey", valkey_ping),
    }

    ready = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ready" if ready else "degraded", "checks": checks},
    )
