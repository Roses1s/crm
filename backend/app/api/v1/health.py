"""Проверки живости и готовности сервиса."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from redis import asyncio as aioredis
from sqlalchemy import text

from app.api.deps import SessionDep
from app.core.config import settings

router = APIRouter(tags=["health"])


@router.get("/health", summary="Жив ли процесс")
async def health() -> dict[str, str]:
    return {"status": "ok", "app": settings.app_name, "env": settings.environment}


@router.get("/health/ready", summary="Готов ли сервис принимать трафик")
async def readiness(session: SessionDep) -> JSONResponse:
    checks: dict[str, Any] = {}

    try:
        await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {exc}"

    try:
        client = aioredis.from_url(settings.valkey_url)  # type: ignore[no-untyped-call]
        await client.ping()
        await client.aclose()
        checks["valkey"] = "ok"
    except Exception as exc:
        checks["valkey"] = f"error: {exc}"

    ready = all(v == "ok" for v in checks.values())
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ready" if ready else "degraded", "checks": checks},
    )
