"""Активности: планирование, состояние по сроку, закрытие."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD

TODAY = datetime.now(tz=UTC).date()


async def _plan(client: AsyncClient, lead_id: int, **overrides: object) -> dict:
    payload = {"type": "call", "summary": "Перезвонить по ставке", "due_date": str(TODAY)}
    payload.update(overrides)  # type: ignore[arg-type]
    response = await client.post(f"/api/v1/crm/leads/{lead_id}/activities", json=payload)
    assert response.status_code == 201, response.text
    return response.json()


async def test_plan_activity_assigns_to_author(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    activity = await _plan(auth_client, lead_id)

    assert activity["summary"] == "Перезвонить по ставке"
    assert activity["state"] == "today"
    assert activity["assigned_to_name"] == "Артём Соколов"

    listed = await auth_client.get(f"/api/v1/crm/leads/{lead_id}/activities")
    assert len(listed.json()) == 1


async def test_state_depends_on_due_date(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    overdue = await _plan(auth_client, lead_id, due_date=str(TODAY - timedelta(days=2)))
    planned = await _plan(auth_client, lead_id, due_date=str(TODAY + timedelta(days=5)))

    assert overdue["state"] == "overdue"
    assert planned["state"] == "planned"


async def test_lead_card_shows_nearest_activity(auth_client: AsyncClient, seeded: dict) -> None:
    """Часики на канбане берут состояние из ближайшего незакрытого действия."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]

    before = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).json()
    assert before["activity_state"] is None

    await _plan(auth_client, lead_id, due_date=str(TODAY + timedelta(days=3)))
    await _plan(auth_client, lead_id, due_date=str(TODAY - timedelta(days=1)), summary="Срочно")

    after = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).json()
    assert after["activity_state"] == "overdue"
    assert after["next_activity_summary"] == "Срочно"

    # И в списке для канбана — тоже.
    board = (await auth_client.get("/api/v1/crm/leads")).json()["results"]
    assert board[0]["activity_state"] == "overdue"


async def test_closing_activity_writes_to_timeline(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    activity = await _plan(auth_client, lead_id, summary="Согласовать договор")

    done = await auth_client.patch(
        f"/api/v1/crm/activities/{activity['id']}", json={"is_done": True}
    )
    assert done.status_code == 200
    assert done.json()["state"] == "done"

    # Закрытая активность уходит из списка открытых…
    assert (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/activities")).json() == []
    assert (
        len(
            (
                await auth_client.get(
                    f"/api/v1/crm/leads/{lead_id}/activities", params={"include_done": True}
                )
            ).json()
        )
        == 1
    )

    # …и появляется в ленте чаттера.
    timeline = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}/timeline")).json()
    assert timeline[0]["type"] == "activity"
    assert "Согласовать договор" in timeline[0]["body"]

    # Карточка снова без часиков.
    lead = (await auth_client.get(f"/api/v1/crm/leads/{lead_id}")).json()
    assert lead["activity_state"] is None


async def test_my_activities_are_sorted_by_due_date(auth_client: AsyncClient, seeded: dict) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    await _plan(auth_client, lead_id, due_date=str(TODAY + timedelta(days=7)), summary="Позже")
    await _plan(auth_client, lead_id, due_date=str(TODAY), summary="Сегодня")

    mine = (await auth_client.get("/api/v1/crm/activities/my")).json()
    assert [a["summary"] for a in mine] == ["Сегодня", "Позже"]


async def test_manager_cannot_delete_foreign_activity(
    client: AsyncClient, auth_client: AsyncClient, seeded: dict
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    activity = await _plan(auth_client, lead_id)

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]

    response = await client.delete(
        f"/api/v1/crm/activities/{activity['id']}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 403
