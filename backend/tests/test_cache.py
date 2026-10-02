"""Кеш глобальных справочников: теги и перевозчики.

Проверяем, что кеш действительно работает (второй одинаковый запрос отдаётся из
кеша) и что он сбрасывается при изменении справочника — иначе пользователи
видели бы устаревший список.
"""

from __future__ import annotations

from httpx import AsyncClient

CACHE_HEADER = "X-FastAPI-Cache"


async def test_tags_list_is_cached_then_invalidated(auth_client: AsyncClient, seeded: dict) -> None:
    # Первый запрос — промах кеша, второй такой же — попадание.
    first = await auth_client.get("/api/v1/crm/tags")
    assert first.status_code == 200
    assert first.headers.get(CACHE_HEADER) == "MISS"

    second = await auth_client.get("/api/v1/crm/tags")
    assert second.headers.get(CACHE_HEADER) == "HIT"
    assert second.json() == first.json()

    # Создание тега сбрасывает кеш: список сразу показывает новый тег.
    created = await auth_client.post(
        "/api/v1/crm/tags", json={"name": "Экспресс", "color": "#935116"}
    )
    assert created.status_code == 201, created.text

    after = await auth_client.get("/api/v1/crm/tags")
    assert after.headers.get(CACHE_HEADER) == "MISS"
    assert "Экспресс" in [t["name"] for t in after.json()]


async def test_carriers_list_is_cached_then_invalidated(
    auth_client: AsyncClient, seeded: dict
) -> None:
    first = await auth_client.get("/api/v1/carriers")
    assert first.status_code == 200
    assert first.headers.get(CACHE_HEADER) == "MISS"

    second = await auth_client.get("/api/v1/carriers")
    assert second.headers.get(CACHE_HEADER) == "HIT"

    created = await auth_client.post(
        "/api/v1/carriers", json={"name": "ООО «Новый Перевозчик»", "inn": "7707083893"}
    )
    assert created.status_code == 201, created.text

    after = await auth_client.get("/api/v1/carriers")
    assert after.headers.get(CACHE_HEADER) == "MISS"
    assert "ООО «Новый Перевозчик»" in [c["name"] for c in after.json()]


async def test_carriers_cache_key_separates_query_params(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Разные query-параметры (?only_active) кешируются раздельно."""
    all_first = await auth_client.get("/api/v1/carriers")
    assert all_first.headers.get(CACHE_HEADER) == "MISS"

    # Другой набор параметров — свой ключ, тоже промах.
    active_first = await auth_client.get("/api/v1/carriers?only_active=true")
    assert active_first.headers.get(CACHE_HEADER) == "MISS"

    # Повтор каждого — попадание.
    assert (await auth_client.get("/api/v1/carriers")).headers.get(CACHE_HEADER) == "HIT"
    assert (await auth_client.get("/api/v1/carriers?only_active=true")).headers.get(
        CACHE_HEADER
    ) == "HIT"
