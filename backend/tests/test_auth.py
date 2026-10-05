"""Аутентификация и доступ по ролям."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.security import LoginAttempt
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


async def test_stolen_refresh_token_is_useless_after_logout(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Главное в выходе из системы: сам токен перестаёт работать.

    Удаления куки мало — перехваченную копию можно подставить обратно.
    После выхода идентификатор токена в чёрном списке, и продлить сессию
    по нему нельзя.
    """
    await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    stolen = client.cookies["crm_refresh"]

    assert (await client.post("/api/v1/auth/logout")).status_code == 204

    # «Злоумышленник» возвращает украденную куку на место.
    client.cookies.set("crm_refresh", stolen)
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


async def test_logout_without_cookie_is_ok(client: AsyncClient) -> None:
    """Выход без сессии не должен падать — просто ничего не делает."""
    assert (await client.post("/api/v1/auth/logout")).status_code == 204


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


async def test_refresh_rotates_and_old_token_stops_working(
    client: AsyncClient, seeded: dict[str, object]
) -> None:
    """Прежний обновляющий токен перестаёт работать после ротации.

    Регрессия: раньше старая кука оставалась действительной все 14 дней,
    сколько бы раз пользователь ни продлевал сессию.
    """
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    old_cookie = login.cookies["crm_refresh"]

    first = await client.post("/api/v1/auth/refresh", cookies={"crm_refresh": old_cookie})
    assert first.status_code == 200

    # Сразу после ротации прежний токен ещё принимается — это защита от гонки
    # параллельных вкладок (REFRESH_GRACE_SECONDS).
    from app.api.v1 import auth as auth_module

    original_grace = auth_module.REFRESH_GRACE_SECONDS
    auth_module.REFRESH_GRACE_SECONDS = -1
    try:
        replay = await client.post("/api/v1/auth/refresh", cookies={"crm_refresh": old_cookie})
    finally:
        auth_module.REFRESH_GRACE_SECONDS = original_grace

    assert replay.status_code == 401, replay.text


async def test_login_of_disabled_user_is_logged_as_failure(
    client: AsyncClient, session: AsyncSession, seeded: dict[str, object]
) -> None:
    """Отключённая учётная запись: отказ и запись в журнале как неудача."""
    manager = seeded["manager"]
    manager.is_active = False  # type: ignore[attr-defined]
    await session.commit()

    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "manager@crmdetroid.ru", "password": TEST_PASSWORD},
    )
    assert response.status_code == 403

    attempts = (await session.execute(select(LoginAttempt))).scalars().all()
    assert [a.successful for a in attempts] == [False]


async def test_long_password_is_rejected(auth_client: AsyncClient) -> None:
    """Пароль длиннее 72 байт не принимается: bcrypt всё равно его обрежет."""
    response = await auth_client.post(
        "/api/v1/admin/users",
        json={
            "email": "long@crmdetroid.ru",
            "password": "я" * 40,  # 80 байт в UTF-8
            "first_name": "Длинный",
            "last_name": "Пароль",
            "role": "manager",
        },
    )
    assert response.status_code == 422, response.text
