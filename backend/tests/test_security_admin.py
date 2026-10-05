"""Раздел «Безопасность»: журнал попыток входа и резервные копии."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import TEST_PASSWORD


async def test_failed_login_is_recorded(client: AsyncClient, seeded: dict[str, object]) -> None:
    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": "wrong-one"},
    )
    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": "wrong-two"},
    )

    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]

    response = await client.get(
        "/api/v1/admin/login-attempts", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200
    rows = response.json()
    assert rows[0]["username"] == "admin@crmdetroid.ru"
    # Две неудачные попытки сгруппированы в одну строку, удачная не считается.
    assert rows[0]["failures"] == 2


async def test_login_attempts_require_admin(client: AsyncClient, seeded: dict[str, object]) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]
    response = await client.get(
        "/api/v1/admin/login-attempts", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 403


async def test_backups_report_missing_directory(auth_client: AsyncClient) -> None:
    """Каталога бэкапов в тестах нет — ручка должна сказать «устарело», а не упасть."""
    response = await auth_client.get("/api/v1/admin/backups")
    assert response.status_code == 200
    body = response.json()
    assert body["results"] == []
    assert body["is_stale"] is True
    assert body["last_backup_at"] is None


async def test_backups_report_counts_uploaded_files(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """После загрузки файла сводка по месту на диске видит его размер."""
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    payload = b"%PDF-1.4 " + b"x" * 500
    upload = await auth_client.post(
        f"/api/v1/crm/leads/{lead_id}/attachments",
        files={"file": ("Договор.pdf", payload, "application/pdf")},
    )
    assert upload.status_code == 201, upload.text

    response = await auth_client.get("/api/v1/admin/backups")
    assert response.status_code == 200
    storage = response.json()["storage"]
    assert storage["files"] == 1
    assert storage["bytes"] == len(payload)


async def test_deleting_user_moves_leads_to_admin(
    auth_client: AsyncClient, client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Лиды уволенного сотрудника переезжают на доску администратора."""
    manager_id = seeded["manager"].id  # type: ignore[attr-defined]
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    stages = (await client.get("/api/v1/crm/stages", headers=headers)).json()
    # «Новый» есть и у администратора — карточка должна попасть в одноимённый этап.
    new_stage = next(s for s in stages if s["name"] == "Новый")
    await client.post(
        "/api/v1/crm/leads",
        json={"name": "ООО «Сирень»", "inn": "7451234565", "stage_id": new_stage["id"]},
        headers=headers,
    )

    removed = await auth_client.delete(f"/api/v1/admin/users/{manager_id}")
    assert removed.status_code == 204

    mine = (await auth_client.get("/api/v1/crm/leads")).json()["results"]
    moved = next(lead for lead in mine if lead["name"] == "ООО «Сирень»")
    assert moved["stage_name"] == "Новый"

    admin_stages = (await auth_client.get("/api/v1/crm/stages")).json()
    assert moved["stage_id"] in [s["id"] for s in admin_stages]


async def test_last_admin_cannot_demote_himself(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Единственный администратор не может снять с себя роль.

    Регрессия: раньше запрос проходил, и в системе не оставалось никого, кто
    может заводить сотрудников и смотреть бэкапы.
    """
    admin = seeded["admin"]
    response = await auth_client.patch(
        f"/api/v1/admin/users/{admin.id}",  # type: ignore[attr-defined]
        json={"role": "manager"},
    )
    assert response.status_code == 400, response.text
    assert response.json()["code"] == "last_admin"


async def test_last_admin_cannot_disable_himself(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    admin = seeded["admin"]
    response = await auth_client.patch(
        f"/api/v1/admin/users/{admin.id}",  # type: ignore[attr-defined]
        json={"is_active": False},
    )
    assert response.status_code == 400
    assert response.json()["code"] == "last_admin"


async def test_admin_can_step_down_when_there_is_another_admin(
    auth_client: AsyncClient, session: AsyncSession, seeded: dict[str, object]
) -> None:
    """Если администраторов двое — роль снять можно."""
    created = await auth_client.post(
        "/api/v1/admin/users",
        json={
            "email": "second-admin@crmdetroid.ru",
            "password": "SuperSecret123",
            "first_name": "Второй",
            "last_name": "Админ",
            "role": "admin",
        },
    )
    assert created.status_code == 201, created.text

    admin = seeded["admin"]
    response = await auth_client.patch(
        f"/api/v1/admin/users/{admin.id}",  # type: ignore[attr-defined]
        json={"role": "manager"},
    )
    assert response.status_code == 200, response.text
