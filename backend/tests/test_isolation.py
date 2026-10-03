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


async def test_pager_counts_only_own_leads(
    client: AsyncClient, auth_client: AsyncClient, seeded: dict
) -> None:
    """Переключатель «N из M» не должен выдавать количество чужих карточек."""
    headers = await manager_headers(client)
    stage_id = (await client.get("/api/v1/crm/stages", headers=headers)).json()[0]["id"]
    mine = await client.post(
        "/api/v1/crm/leads",
        json={"name": "ООО «Тюльпан»", "inn": "7451234565", "stage_id": stage_id},
        headers=headers,
    )
    lead_id = mine.json()["id"]

    pager = await client.get(f"/api/v1/crm/leads/{lead_id}/pager", headers=headers)
    assert pager.status_code == 200
    body = pager.json()
    # У менеджера ровно один свой лид, лид админа сюда попадать не должен.
    assert body["total"] == 1
    assert body["position"] == 1
    assert body["prev_id"] is None
    assert body["next_id"] is None

    # Чужую карточку через переключатель тоже не посмотреть.
    foreign_id = seeded["lead"].id  # type: ignore[attr-defined]
    denied = await client.get(f"/api/v1/crm/leads/{foreign_id}/pager", headers=headers)
    assert denied.status_code == 404

    # Админ видит карточку менеджера, но листалка не смешивает две доски:
    # у лида админа своя доска из одной карточки, сосед менеджера сюда не
    # попадает (иначе стрелками «вперёд/назад» можно было бы случайно
    # перескочить на чужую доску — баг, который правили 01.10.2026).
    admin_pager = await auth_client.get(f"/api/v1/crm/leads/{foreign_id}/pager")
    assert admin_pager.json()["total"] == 1


async def test_lead_transfer_moves_card_to_colleague_board(
    client: AsyncClient, auth_client: AsyncClient, seeded: dict
) -> None:
    """Передача меняет продавца и переставляет карточку на доску получателя."""
    headers = await manager_headers(client)
    stages = (await client.get("/api/v1/crm/stages", headers=headers)).json()
    stage = next(s for s in stages if s["name"] == "Перезвонить")
    lead_id = (
        await client.post(
            "/api/v1/crm/leads",
            json={"name": "ООО «Пион»", "inn": "7451234565", "stage_id": stage["id"]},
            headers=headers,
        )
    ).json()["id"]

    admin_id = seeded["admin"].id  # type: ignore[attr-defined]
    transfer = await client.post(
        f"/api/v1/crm/leads/{lead_id}/transfer", json={"user_id": admin_id}, headers=headers
    )
    assert transfer.status_code == 204

    # У бывшего владельца карточки больше нет.
    assert (await client.get(f"/api/v1/crm/leads/{lead_id}", headers=headers)).status_code == 404

    moved = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).json()
    assert moved["assigned_to_id"] == admin_id
    admin_stages = (await auth_client.get("/api/v1/crm/stages")).json()
    # Этап подобран по названию на доске получателя.
    assert moved["stage_id"] in [s["id"] for s in admin_stages]

    # Передача видна в ленте.
    timeline = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")).json()
    assert any(entry["field_label"] == "Продавец" for entry in timeline)


async def test_cannot_transfer_foreign_lead(client: AsyncClient, seeded: dict) -> None:
    headers = await manager_headers(client)
    foreign_id = seeded["lead"].id  # type: ignore[attr-defined]
    admin_id = seeded["admin"].id  # type: ignore[attr-defined]

    response = await client.post(
        f"/api/v1/crm/leads/{foreign_id}/transfer", json={"user_id": admin_id}, headers=headers
    )
    assert response.status_code == 404


async def test_colleagues_list_hides_self(client: AsyncClient, seeded: dict) -> None:
    headers = await manager_headers(client)
    rows = (await client.get("/api/v1/users/colleagues", headers=headers)).json()
    names = [row["full_name"] for row in rows]
    assert "Артём Соколов" in names
    assert "Денис Кузнецов" not in names
