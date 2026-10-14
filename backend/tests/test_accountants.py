"""Справочник бухгалтеров доступен сотрудникам для чтения и администратору для правки."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD


async def manager_headers(client: AsyncClient) -> dict[str, str]:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


async def patch_lead(
    client: AsyncClient, lead_id: int, body: dict[str, object]
) -> tuple[int, dict[str, object]]:
    current = await client.get(f"/api/v1/crm/leads/{lead_id}")
    payload = {"expected_updated_at": current.json()["updated_at"], **body}
    response = await client.patch(f"/api/v1/crm/leads/{lead_id}", json=payload)
    return response.status_code, response.json()


async def test_all_employees_can_list_only_active_accountants(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    headers = await manager_headers(client)
    response = await client.get("/api/v1/crm/accountants", headers=headers)

    assert response.status_code == 200
    names = [row["name"] for row in response.json()]
    assert "Пухова Елена Витальевна" in names
    assert all(row["is_active"] for row in response.json())


async def test_accountant_management_is_admin_only(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    headers = await manager_headers(client)
    read_admin_list = await client.get("/api/v1/admin/accountants", headers=headers)
    create = await client.post(
        "/api/v1/admin/accountants", json={"name": "Новый бухгалтер"}, headers=headers
    )

    assert read_admin_list.status_code == 403
    assert create.status_code == 403


async def test_admin_can_create_rename_deactivate_and_restore_accountant(
    auth_client: AsyncClient,
) -> None:
    created = await auth_client.post(
        "/api/v1/admin/accountants", json={"name": "  Новый   бухгалтер "}
    )
    assert created.status_code == 201, created.text
    accountant = created.json()
    assert accountant["name"] == "Новый бухгалтер"
    assert accountant["is_active"] is True

    duplicate = await auth_client.post(
        "/api/v1/admin/accountants", json={"name": " НОВЫЙ бухгалтер "}
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["code"] == "accountant_name_conflict"

    case_updated = await auth_client.patch(
        f"/api/v1/admin/accountants/{accountant['id']}",
        json={"name": " НОВЫЙ   БУХГАЛТЕР "},
    )
    assert case_updated.status_code == 200
    assert case_updated.json()["name"] == "НОВЫЙ БУХГАЛТЕР"

    updated = await auth_client.patch(
        f"/api/v1/admin/accountants/{accountant['id']}",
        json={"name": "Изменённое ФИО"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Изменённое ФИО"

    deleted = await auth_client.delete(f"/api/v1/admin/accountants/{accountant['id']}")
    assert deleted.status_code == 204
    active_names = [
        row["name"] for row in (await auth_client.get("/api/v1/crm/accountants")).json()
    ]
    assert "Изменённое ФИО" not in active_names

    admin_rows = (await auth_client.get("/api/v1/admin/accountants")).json()
    inactive = next(row for row in admin_rows if row["id"] == accountant["id"])
    assert inactive["is_active"] is False

    restored = await auth_client.post(f"/api/v1/admin/accountants/{accountant['id']}/restore")
    assert restored.status_code == 200
    assert restored.json()["is_active"] is True


async def test_archived_accountant_keeps_existing_lead_assignment(
    auth_client: AsyncClient, seeded: dict[str, object]
) -> None:
    lead_id = seeded["lead"].id  # type: ignore[attr-defined]
    created = await auth_client.post(
        "/api/v1/admin/accountants", json={"name": "Бухгалтер для старой карточки"}
    )
    accountant_id = created.json()["id"]

    status, updated = await patch_lead(
        auth_client, lead_id, {"accountant_name": "Бухгалтер для старой карточки"}
    )
    assert status == 200
    assert updated["accountant_name"] == "Бухгалтер для старой карточки"

    deleted = await auth_client.delete(f"/api/v1/admin/accountants/{accountant_id}")
    assert deleted.status_code == 204

    # Сохранение другого поля не должно стирать назначенное историческое ФИО.
    status, unchanged = await patch_lead(auth_client, lead_id, {"priority": 1})
    assert status == 200
    assert unchanged["accountant_name"] == "Бухгалтер для старой карточки"

    # Удалённого из справочника бухгалтера нельзя назначить заново.
    status, rejected = await patch_lead(auth_client, lead_id, {"accountant_name": None})
    assert status == 200
    assert rejected["accountant_name"] is None
    current = await auth_client.get(f"/api/v1/crm/leads/{lead_id}")
    rejected_assignment = await auth_client.patch(
        f"/api/v1/crm/leads/{lead_id}",
        json={
            "expected_updated_at": current.json()["updated_at"],
            "accountant_name": "Бухгалтер для старой карточки",
        },
    )
    assert rejected_assignment.status_code == 422
    assert rejected_assignment.json()["code"] == "accountant_unavailable"
