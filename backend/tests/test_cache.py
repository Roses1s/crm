"""Кеш глобальных справочников (теги и т.п.).

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
