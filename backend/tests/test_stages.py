"""Личные доски: стандартный набор этапов и защита чужой воронки."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD

DEFAULT_NAMES = [
    "Новый",
    "Перезвонить",
    "Вышел на ЛПР",
    "Потенциальный клиент",
    "Уехали, ждём заявку",
]


async def manager_token(client: AsyncClient) -> str:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return str(login.json()["access_token"])


async def test_first_visit_creates_default_board(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    """У нового менеджера доски ещё нет — она создаётся при первом открытии."""
    token = await manager_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    response = await client.get("/api/v1/crm/stages", headers=headers)
    assert response.status_code == 200
    assert [s["name"] for s in response.json()] == DEFAULT_NAMES

    # Повторный заход не должен плодить дубликаты.
    again = await client.get("/api/v1/crm/stages", headers=headers)
    assert [s["name"] for s in again.json()] == DEFAULT_NAMES


async def test_manager_sees_only_own_stages(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Этапы админа не попадают в доску менеджера и наоборот."""
    admin_stages = (await auth_client.get("/api/v1/crm/stages")).json()
    assert "Переговоры" in [s["name"] for s in admin_stages]

    token = await manager_token(client)
    manager_stages = (
        await client.get("/api/v1/crm/stages", headers={"Authorization": f"Bearer {token}"})
    ).json()
    assert "Переговоры" not in [s["name"] for s in manager_stages]


async def test_manager_cannot_rename_foreign_stage(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict[str, object]
) -> None:
    admin_stage_id = (await auth_client.get("/api/v1/crm/stages")).json()[0]["id"]
    token = await manager_token(client)

    response = await client.patch(
        f"/api/v1/crm/stages/{admin_stage_id}",
        json={"name": "Моё"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_new_stage_belongs_to_its_author(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    token = await manager_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    created = await client.post(
        "/api/v1/crm/stages", json={"name": "Отказ", "sequence": 9}, headers=headers
    )
    assert created.status_code == 201

    names = [s["name"] for s in (await client.get("/api/v1/crm/stages", headers=headers)).json()]
    assert "Отказ" in names
