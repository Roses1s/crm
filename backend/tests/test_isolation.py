"""Изоляция досок: менеджер видит только свои лиды, заявки и активности."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_foreign_lead_is_invisible(client: AsyncClient, seeded: dict) -> None:
    """Лид админа не виден менеджеру ни в списке, ни в карточке, ни поиском."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    headers = await manager_headers(client)

    listed = await client.get("/api/v1/crm/leads", headers=headers)
    assert listed.json()["results"] == []

    card = await client.get(f"/api/v1/crm/leads/{lead_id}", headers=headers)
    assert card.status_code == 404

    found = await client.get("/api/v1/crm/leads?search=Уралпромснаб", headers=headers)
    assert found.json()["results"] == []


async def test_new_lead_lands_on_own_board(client: AsyncClient, seeded: dict) -> None:
    """Созданный менеджером лид закрепляется за ним, даже если указан коллега."""
    headers = await manager_headers(client)
    admin_id = seeded["admin"].id  # type: ignore[attr-defined]
    stage_id = (await client.get("/api/v1/crm/stages", headers=headers)).json()[0]["id"]

    created = await client.post(
        "/api/v1/crm/leads",
        json={
            "name": "ООО «Ромашка»",
            "inn": "7451234565",
            "stage_id": stage_id,
            "assigned_to_id": admin_id,
        },
        headers=headers,
    )
    assert created.status_code == 201
    assert created.json()["assigned_to_id"] != admin_id

    mine = await client.get("/api/v1/crm/leads", headers=headers)
    assert [lead["name"] for lead in mine.json()["results"]] == ["ООО «Ромашка»"]


async def test_foreign_shipment_is_invisible(
    client: AsyncClient, auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    shipment_id = (await auth_client.post("/api/v1/shipments", json={"lead_id": lead_id})).json()[
        "id"
    ]
    headers = await manager_headers(client)

    assert (await client.get("/api/v1/shipments", headers=headers)).json()["results"] == []
    assert (
        await client.get(f"/api/v1/shipments/{shipment_id}", headers=headers)
    ).status_code == 404

    # И завести заявку по чужому лиду тоже нельзя.
    denied = await client.post("/api/v1/shipments", json={"lead_id": lead_id}, headers=headers)
    assert denied.status_code == 404


async def test_admin_sees_everything(auth_client: AsyncClient, client: AsyncClient) -> None:
    """Администратор видит лиды всех сотрудников — это его рабочий режим."""
    headers = await manager_headers(client)
    stage_id = (await client.get("/api/v1/crm/stages", headers=headers)).json()[0]["id"]
    await client.post(
        "/api/v1/crm/leads",
        json={"name": "ООО «Василёк»", "inn": "7451234565", "stage_id": stage_id},
        headers=headers,
    )

    names = [
        lead["name"] for lead in (await auth_client.get("/api/v1/crm/leads")).json()["results"]
    ]
    assert "ООО «Василёк»" in names
