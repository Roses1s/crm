"""Модуль «Клиенты»: все лиды компании, чужой активный — маскирован."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_owner_sees_full_card_of_own_lead(auth_client: AsyncClient, seeded: dict) -> None:
    # seeded["lead"] принадлежит админу — auth_client как раз залогинен им.
    response = await auth_client.get("/api/v1/crm/customers")
    assert response.status_code == 200
    body = response.json()["results"]
    assert len(body) == 1
    row = body[0]
    assert row["can_open"] is True
    assert row["name"] == "ООО «Уралпромснаб»"
    assert row["inn"] == "7451234565"
    assert row["logist_contact"] == "Громов Сергей"
    assert row["priority"] == 3
    assert row["stage_name"] == "Новый"
    assert [t["name"] for t in row["tags"]] == ["Крупный клиент"]


async def test_colleague_sees_only_basic_fields_of_foreign_active_lead(
    client: AsyncClient, seeded: dict
) -> None:
    headers = await manager_headers(client)
    response = await client.get("/api/v1/crm/customers", headers=headers)
    assert response.status_code == 200
    row = response.json()["results"][0]

    assert row["can_open"] is False
    # Разрешено: название, ИНН, кто ведёт.
    assert row["name"] == "ООО «Уралпромснаб»"
    assert row["inn"] == "7451234565"
    assert row["assigned_to_name"]
    # Запрещено: контакты, приоритет, этап, теги — всё пусто.
    assert row["logist_contact"] is None
    assert row["logist_phone"] is None
    assert row["logist_email"] is None
    assert row["priority"] is None
    assert row["stage_name"] is None
    assert row["tags"] == []


async def test_lost_lead_is_fully_open_to_a_colleague(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id
    reason_id = seeded["loss_reason"].id
    lose = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id}
    )
    assert lose.status_code == 204

    headers = await manager_headers(client)
    response = await client.get("/api/v1/crm/customers", headers=headers)
    row = response.json()["results"][0]

    assert row["can_open"] is True
    assert row["is_archived"] is True
    assert row["loss_reason_name"] == "Перестал возить"
    assert row["logist_contact"] == "Громов Сергей"
    assert row["priority"] == 3
    assert [t["name"] for t in row["tags"]] == ["Крупный клиент"]


async def test_search_matches_name_or_inn_only(client: AsyncClient, seeded: dict) -> None:
    headers = await manager_headers(client)
    hit = await client.get(
        "/api/v1/crm/customers", params={"search": "7451234565"}, headers=headers
    )
    miss = await client.get("/api/v1/crm/customers", params={"search": "Ромашка"}, headers=headers)
    assert hit.json()["count"] == 1
    assert miss.json()["count"] == 0


async def test_customers_endpoint_requires_auth(client: AsyncClient) -> None:
    response = await client.get("/api/v1/crm/customers")
    assert response.status_code == 401
