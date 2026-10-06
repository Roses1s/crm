"""Справочник причин проигрыша: чтение всем, изменение — только администратору."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def test_any_role_can_list_loss_reasons(auth_client: AsyncClient, seeded: dict) -> None:
    headers = await manager_headers(auth_client)
    response = await auth_client.get("/api/v1/crm/loss-reasons", headers=headers)
    assert response.status_code == 200
    assert [r["name"] for r in response.json()] == ["Перестал возить"]


async def test_manager_cannot_create_loss_reason(auth_client: AsyncClient) -> None:
    headers = await manager_headers(auth_client)
    response = await auth_client.post(
        "/api/v1/crm/loss-reasons", json={"name": "Другое"}, headers=headers
    )
    assert response.status_code == 403


async def test_admin_can_add_and_remove_loss_reason(auth_client: AsyncClient) -> None:
    created = await auth_client.post("/api/v1/crm/loss-reasons", json={"name": "Долго не отвечал"})
    assert created.status_code == 201
    reason_id = created.json()["id"]

    listed = await auth_client.get("/api/v1/crm/loss-reasons")
    assert "Долго не отвечал" in [r["name"] for r in listed.json()]

    deleted = await auth_client.delete(f"/api/v1/crm/loss-reasons/{reason_id}")
    assert deleted.status_code == 204

    listed_after = await auth_client.get("/api/v1/crm/loss-reasons")
    assert "Долго не отвечал" not in [r["name"] for r in listed_after.json()]


async def test_used_loss_reason_cannot_be_deleted(auth_client: AsyncClient, seeded: dict) -> None:
    """Причина, которой помечены проигранные лиды, не удаляется (Б-15).

    У колонки ondelete=SET NULL: удаление молча стирало бы причину из истории
    всех проигранных с ней лидов. Лишнюю причину удалить по-прежнему можно.
    """
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    reason_id = seeded["loss_reason"].id  # type: ignore[attr-defined]

    await auth_client.post(f"/api/v1/crm/leads/{lead_id}/lose", json={"reason_id": reason_id})

    denied = await auth_client.delete(f"/api/v1/crm/loss-reasons/{reason_id}")
    assert denied.status_code == 400
    assert denied.json()["code"] == "loss_reason_in_use"

    # Причина осталась и в справочнике, и у проигранного лида.
    listed = await auth_client.get("/api/v1/crm/loss-reasons")
    assert "Перестал возить" in [r["name"] for r in listed.json()]
    card = await auth_client.get(f"/api/v1/crm/leads/{lead_id}")
    assert card.json()["loss_reason_name"] == "Перестал возить"
