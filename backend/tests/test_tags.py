"""Теги: создавать/красить может любой сотрудник, удалять — только админ (Б-16)."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_manager_creates_but_cannot_delete_tag(
    auth_client: AsyncClient, seeded: dict
) -> None:
    """Создавать теги можно всем, а удалять — только администратору:
    тег общий, одно нажатие снимает его со всех карточек компании."""
    headers = await manager_headers(auth_client)

    created = await auth_client.post(
        "/api/v1/crm/tags", json={"name": "Срочно", "color": "#ff00aa"}, headers=headers
    )
    assert created.status_code == 201, created.text
    assert created.json()["color"] == "#ff00aa"
    tag_id = created.json()["id"]

    # Менеджеру удаление запрещено.
    denied = await auth_client.delete(f"/api/v1/crm/tags/{tag_id}", headers=headers)
    assert denied.status_code == 403

    # Администратору — можно.
    deleted = await auth_client.delete(f"/api/v1/crm/tags/{tag_id}")
    assert deleted.status_code == 204


async def test_create_tag_rejects_non_hex_color(auth_client: AsyncClient, seeded: dict) -> None:
    resp = await auth_client.post("/api/v1/crm/tags", json={"name": "Плохой", "color": "blue"})
    assert resp.status_code == 422


async def test_create_tag_reuses_existing_by_name_case_insensitive(
    auth_client: AsyncClient, seeded: dict
) -> None:
    tag: object = seeded["tag"]  # «Крупный клиент», цвет #1e8449
    resp = await auth_client.post(
        "/api/v1/crm/tags", json={"name": "крупный клиент", "color": "#000000"}
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] == tag.id  # type: ignore[attr-defined]
    assert body["color"] == "#1e8449"  # цвет существующего тега не подменился


async def test_update_tag_name_and_color(auth_client: AsyncClient, seeded: dict) -> None:
    tag_id = seeded["tag"].id  # type: ignore[attr-defined]
    resp = await auth_client.patch(
        f"/api/v1/crm/tags/{tag_id}", json={"name": "ВИП", "color": "#abcdef"}
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "ВИП"
    assert body["color"] == "#abcdef"


async def test_shipment_tags_roundtrip(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    tag_id = seeded["tag"].id  # type: ignore[attr-defined]

    created = await auth_client.post(
        "/api/v1/shipments", json={"lead_id": lead_id, "tag_ids": [tag_id]}
    )
    assert created.status_code == 201, created.text
    assert [t["id"] for t in created.json()["tags"]] == [tag_id]

    shipment_id = created.json()["id"]
    updated = await auth_client.patch(f"/api/v1/shipments/{shipment_id}", json={"tag_ids": []})
    assert updated.status_code == 200
    assert updated.json()["tags"] == []


async def test_customers_list_exposes_tags(auth_client: AsyncClient, seeded: dict) -> None:
    resp = await auth_client.get("/api/v1/crm/customers")
    assert resp.status_code == 200
    row = next(r for r in resp.json()["results"] if r["id"] == seeded["lead"].id)  # type: ignore[attr-defined]
    assert row["tags"][0]["name"] == "Крупный клиент"
