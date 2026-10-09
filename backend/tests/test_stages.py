"""Личные доски: стандартный набор этапов и защита чужой воронки."""

from __future__ import annotations

import asyncio

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.crm import Stage
from tests.conftest import TEST_DATABASE_URL, TEST_PASSWORD

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


async def test_stage_color_respects_database_length(auth_client: AsyncClient) -> None:
    response = await auth_client.post(
        "/api/v1/crm/stages",
        json={"name": "Цвет слишком длинный", "color": "x" * 21},
    )
    assert response.status_code == 422
    assert response.json()["code"] == "validation_error"


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


@pytest.mark.skipif(
    TEST_DATABASE_URL.startswith("sqlite"), reason="Параллельное создание проверяется на PostgreSQL"
)
async def test_concurrent_first_visit_creates_one_default_board(
    client: AsyncClient,
    seeded: dict[str, object],
    session: AsyncSession,
) -> None:
    """Два первых запроса одновременно создают ровно одну личную доску."""
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    headers = {"Authorization": f"Bearer {await manager_token(client)}"}
    barrier = asyncio.Barrier(2)

    async def open_board() -> Response:
        await barrier.wait()
        return await client.get("/api/v1/crm/stages", headers=headers)

    first, second = await asyncio.gather(open_board(), open_board())
    assert first.status_code == second.status_code == 200
    first_stages = first.json()
    second_stages = second.json()
    assert [stage["id"] for stage in first_stages] == [stage["id"] for stage in second_stages]
    assert [stage["name"] for stage in first_stages] == DEFAULT_NAMES

    created = list((await session.scalars(select(Stage).where(Stage.owner_id == manager_id))).all())
    assert len(created) == len(DEFAULT_NAMES)


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


async def test_admin_opens_board_of_employee(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Админ запрашивает доску сотрудника по номеру и получает его этапы."""
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]

    board = await auth_client.get(f"/api/v1/crm/stages?owner_id={manager_id}")
    assert board.status_code == 200
    assert [s["name"] for s in board.json()] == DEFAULT_NAMES

    # Своя доска админа остаётся прежней.
    own = await auth_client.get("/api/v1/crm/stages")
    assert "Переговоры" in [s["name"] for s in own.json()]


async def test_manager_cannot_open_foreign_board(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    admin_id = seeded["admin"].id  # type: ignore[attr-defined]
    token = await manager_token(client)

    response = await client.get(
        f"/api/v1/crm/stages?owner_id={admin_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403


async def test_reorder_stages_persists_full_board_order(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Горизонтальное перетаскивание меняет порядок этапов после обновления доски."""
    before = (await auth_client.get("/api/v1/crm/stages")).json()
    order = [stage["id"] for stage in reversed(before)]

    response = await auth_client.post("/api/v1/crm/stages/reorder", json={"stage_ids": order})

    assert response.status_code == 200
    assert [stage["id"] for stage in response.json()] == order
    assert [stage["sequence"] for stage in response.json()] == list(range(1, len(order) + 1))

    persisted = (await auth_client.get("/api/v1/crm/stages")).json()
    assert [stage["id"] for stage in persisted] == order


async def test_manager_cannot_reorder_foreign_board(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Менеджер не может переставить этапы администратора по их идентификаторам."""
    admin_stage_ids = [
        stage["id"] for stage in (await auth_client.get("/api/v1/crm/stages")).json()
    ]
    token = await manager_token(client)

    response = await client.post(
        "/api/v1/crm/stages/reorder",
        json={"stage_ids": list(reversed(admin_stage_ids))},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


async def test_reorder_rejects_stages_from_different_boards(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Даже админ не может одним запросом смешать этапы двух досок."""
    admin_stage_id = (await auth_client.get("/api/v1/crm/stages")).json()[0]["id"]
    token = await manager_token(client)
    manager_stages = (
        await client.get("/api/v1/crm/stages", headers={"Authorization": f"Bearer {token}"})
    ).json()

    response = await auth_client.post(
        "/api/v1/crm/stages/reorder",
        json={"stage_ids": [admin_stage_id, manager_stages[0]["id"]]},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "stages_from_different_boards"


async def test_reorder_requires_complete_board_order(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Нельзя случайно исключить этап из порядка и потерять его позицию."""
    stages = (await auth_client.get("/api/v1/crm/stages")).json()

    response = await auth_client.post(
        "/api/v1/crm/stages/reorder",
        json={"stage_ids": [stage["id"] for stage in stages[:-1]]},
    )

    assert response.status_code == 400
    assert response.json()["code"] == "incomplete_stage_order"


async def test_delete_stage_moves_leads_to_fallback(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Непустую колонку можно удалить, если указано, куда перенести карточки.

    Регрессия: раньше запрос падал с 409 «Запись с такими данными уже
    существует». SQLAlchemy при удалении этапа сам обнулял `leads.stage_id`
    у его лидов, потому что перенос ещё не был записан в базу.
    """
    stage_from = seeded["stage_new"]
    stage_to = seeded["stage_talks"]
    lead = seeded["lead"]

    response = await auth_client.delete(
        f"/api/v1/crm/stages/{stage_from.id}",  # type: ignore[attr-defined]
        params={"fallback_stage_id": stage_to.id},  # type: ignore[attr-defined]
    )
    assert response.status_code == 204, response.text

    card = await auth_client.get(f"/api/v1/crm/leads/{lead.id}")  # type: ignore[attr-defined]
    assert card.json()["stage_id"] == stage_to.id  # type: ignore[attr-defined]

    # Перенос виден в ленте карточки: смена колонки не происходит молча (Б-18).
    timeline = await auth_client.get(f"/api/v1/crm/leads/{lead.id}/timeline")  # type: ignore[attr-defined]
    moved = [
        entry
        for entry in timeline.json()
        if entry["field_label"] == "Этапы лидов" and entry["old_value"] == stage_from.name
    ]
    assert len(moved) == 1
    assert moved[0]["new_value"] == stage_to.name
    assert moved[0]["is_stage_change"] is True

    stages = await auth_client.get("/api/v1/crm/stages")
    assert stage_from.id not in [s["id"] for s in stages.json()]  # type: ignore[attr-defined]


async def test_delete_stage_without_fallback_is_rejected(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Без указания запасной колонки непустой этап не удаляется."""
    stage_from = seeded["stage_new"]
    response = await auth_client.delete(
        f"/api/v1/crm/stages/{stage_from.id}"  # type: ignore[attr-defined]
    )
    assert response.status_code == 400
    assert response.json()["code"] == "stage_not_empty"
