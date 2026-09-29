"""Раздел «Безопасность»: журнал попыток входа и резервные копии."""

from __future__ import annotations

from httpx import AsyncClient

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
