"""Аутентификация и доступ по ролям."""

from __future__ import annotations

from httpx import AsyncClient

from tests.conftest import TEST_PASSWORD


async def test_login_returns_access_token_and_sets_cookie(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Короткий токен — в теле, долгий — в куке HttpOnly, недоступной скриптам."""
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["expires_in"] > 0
    # Обновляющий токен в ответе не отдаём — иначе смысл куки теряется.
    assert "refresh_token" not in body

    cookie = response.headers["set-cookie"]
    assert "crm_refresh=" in cookie
    assert "HttpOnly" in cookie
    assert "Path=/api/v1/auth" in cookie
    assert "SameSite=lax" in cookie


async def test_login_with_wrong_password_is_401(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": "nope"},
    )
    assert response.status_code == 401
    assert response.json()["code"] == "http_401"


async def test_me_requires_token(client: AsyncClient) -> None:
    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_me_returns_current_user(auth_client: AsyncClient) -> None:
    response = await auth_client.get("/api/v1/auth/me")
    assert response.status_code == 200
    assert response.json()["email"] == "admin@crmdetroid.ru"
    assert response.json()["role"] == "admin"


async def test_refresh_works_by_cookie(client: AsyncClient, seeded: dict[str, object]) -> None:
    """Продление сессии идёт по куке: тело запроса не нужно."""
    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200
    assert response.json()["access_token"]


async def test_refresh_without_cookie_is_401(client: AsyncClient) -> None:
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_logout_clears_cookie(client: AsyncClient, seeded: dict[str, object]) -> None:
    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    assert (await client.post("/api/v1/auth/logout")).status_code == 204
    # После выхода продлить сессию нечем.
    assert (await client.post("/api/v1/auth/refresh")).status_code == 401


async def test_access_token_is_not_accepted_as_refresh(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    access = login.json()["access_token"]
    # Подсовываем короткий токен в куку — он не должен приниматься как долгий.
    client.cookies.set("crm_refresh", access)
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


async def test_manager_cannot_list_users(client: AsyncClient, seeded: dict[str, object]) -> None:
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    token = login.json()["access_token"]
    response = await client.get("/api/v1/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 403
