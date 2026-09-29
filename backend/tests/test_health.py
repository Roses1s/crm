"""Служебные ручки и общий контракт ошибок."""

from __future__ import annotations

from httpx import AsyncClient


async def test_health_is_public(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_request_id_header_is_returned(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.headers["X-Request-ID"]


async def test_openapi_is_served(client: AsyncClient) -> None:
    schema = (await client.get("/openapi.json")).json()
    paths = schema["paths"]
    for path in (
        "/api/v1/auth/login",
        "/api/v1/crm/leads",
        "/api/v1/crm/leads/{lead_id}/timeline",
        "/api/v1/shipments",
        "/api/v1/admin/stats",
    ):
        assert path in paths, f"в OpenAPI нет {path}"
