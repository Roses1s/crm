"""Аутентификация: вход, продление и завершение сессии, текущий пользователь.

Токен доступа живёт полчаса и приходит в теле ответа, обновляющий — в куке
HttpOnly. В чёрный список (`revoked_tokens`) токен попадает в двух случаях:

* **выход из системы** — действует сразу, перехваченной копией сессию уже не
  продлить;
* **продление сессии** — выдавая новый токен, прежний сразу отзываем
  (ротация). Повторное использование отозванной куки отклоняется сразу.

Вход устроен так, чтобы по ответу нельзя было узнать лишнего: пароль
сверяется даже для несуществующего email (одинаковое время ответа), а
отключённая учётная запись считается неудачной попыткой и в журнале.
"""

from __future__ import annotations

import contextlib
from datetime import UTC, datetime
from typing import Annotated, Any

import jwt
from fastapi import APIRouter, Cookie, HTTPException, Request, Response, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.logging import get_logger
from app.core.rate_limit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.db.locks import advisory_xact_lock
from app.models.security import LoginAttempt, RevokedToken
from app.models.user import User
from app.schemas.auth import AccessToken, LoginRequest
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])
log = get_logger(__name__)


# Путь куки ограничен ручками аутентификации: остальным запросам она не
# требуется, а узкая область действия уменьшает последствия возможной утечки.
REFRESH_COOKIE = "crm_refresh"
COOKIE_PATH = "/api/v1/auth"
REFRESH_LOCK_NAMESPACE = 4229

# Хеш-заглушка для сверки пароля, когда учётной записи не существует: время
# ответа не должно отличаться, иначе по задержке угадывается наличие email.
_DUMMY_HASH = hash_password("несуществующий-пароль-для-постоянного-времени")


def _issue(user: User, response: Response) -> AccessToken:
    """Выдаёт короткий токен доступа и кладёт обновляющий в куку HttpOnly."""
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(user.id),
        max_age=settings.refresh_token_ttl_days * 24 * 3600,
        path=COOKIE_PATH,
        httponly=True,
        # Флаг secure включён только в production: сайт там работает по HTTPS,
        # а на локальном http://localhost кука с этим флагом не установилась бы.
        secure=settings.is_production,
        samesite="lax",
    )
    return AccessToken(
        access_token=create_access_token(user.id),
        expires_in=settings.access_token_ttl_minutes * 60,
    )


@router.post("/login", response_model=AccessToken, summary="Вход по email и паролю")
@limiter.limit(settings.rate_limit_login)
async def login(
    request: Request, response: Response, payload: LoginRequest, session: SessionDep
) -> AccessToken:
    # Параметр request обработчику не нужен напрямую, но без него slowapi не
    # определит клиента для ограничения частоты — не убирать из сигнатуры.
    user = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()

    # Пароль сверяем в любом случае, в том числе для отсутствующего
    # пользователя: одинаковое время ответа не позволяет по задержке
    # перебрать список существующих учётных записей.
    password_ok = verify_password(payload.password, user.hashed_password if user else _DUMMY_HASH)
    # Успешной в журнале считается только попытка, завершившаяся реальным
    # входом: отключённой учётной записи сервер отказывает, поэтому и запись
    # о ней обязана быть неудачной — иначе она не попадёт в «Безопасность».
    ok = user is not None and password_ok and user.is_active
    # Каждая попытка записывается в журнал: по этим записям строится раздел
    # «Безопасность».
    session.add(
        LoginAttempt(
            email=payload.email.lower(),
            ip_address=request.client.host if request.client else "",
            user_agent=request.headers.get("user-agent", "")[:255],
            successful=ok,
        )
    )
    await session.commit()

    if user is None or not password_ok:
        log.warning(
            "auth.login_failed",
            email=payload.email,
            ip=request.client.host if request.client else None,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный email или пароль",
        )
    if not user.is_active:
        log.warning("auth.login_disabled", user_id=user.id)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Учётная запись отключена"
        )

    log.info("auth.login_ok", user_id=user.id, role=user.role.value)
    return _issue(user, response)


@router.post("/refresh", response_model=AccessToken, summary="Обновить токен доступа")
async def refresh(
    response: Response,
    session: SessionDep,
    crm_refresh: Annotated[str | None, Cookie()] = None,
) -> AccessToken:
    """Продлевает сессию по куке — тело запроса не нужно."""
    if not crm_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Нет сессии")
    try:
        data = decode_token(crm_refresh, "refresh")
        user_id = int(data["sub"])
        jti = data.get("jti")
        if not isinstance(jti, str) or not jti:
            raise ValueError("у refresh-токена нет идентификатора")
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен"
        ) from exc

    # Блокировка по идентификатору токена выстраивает параллельные продления
    # одной куки в очередь: первое отзывает токен, следующее после ожидания
    # получит 401. Штатную гонку вкладок при этом разрешает frontend:
    # запросы внутри вкладки объединяет refreshInFlight, а проигравшая после
    # 401 повторяет запрос с новой кукой — она у вкладок браузера общая.
    await advisory_xact_lock(session, namespace=REFRESH_LOCK_NAMESPACE, key=jti)

    # Отозванным токеном продлевать сессию нельзя даже до конца его срока:
    # перехваченная кука не должна переживать выход пользователя.
    if await _is_revoked(session, jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия завершена")

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь недоступен"
        )

    # Ротация при продлении: прежний токен отзываем в момент выдачи нового.
    # Иначе одна перехваченная кука оставалась бы рабочей весь срок жизни
    # (14 дней), сколько бы раз владелец ни обновлял сессию.
    await _revoke(session, data, reason="rotation")
    return _issue(user, response)


async def _revoked_entry(session: SessionDep, jti: str | None) -> RevokedToken | None:
    if not jti:
        return None
    found = await session.execute(select(RevokedToken).where(RevokedToken.jti == jti))
    return found.scalar_one_or_none()


async def _is_revoked(session: SessionDep, jti: str | None) -> bool:
    """Проверяет, что refresh-токен ещё не был отозван.

    Ротация действует немедленно: иначе перехваченная старая cookie могла бы
    успеть выпустить собственный новый токен и пережить выход пользователя.
    Легитимную гонку вкладок гасит frontend: повторяет запрос с новой кукой.
    """
    return await _revoked_entry(session, jti) is not None


async def _revoke(session: SessionDep, payload: dict[str, Any], reason: str) -> None:
    """Заносит обновляющий токен в чёрный список (до его собственного срока)."""
    jti = str(payload.get("jti") or "")
    if not jti:
        return

    existing = await _revoked_entry(session, jti)
    if existing is not None:
        # При повторном отзыве сохраняем причину для аудита; сама
        # недействительность токена от причины уже не зависит.
        if reason == "logout" and existing.reason != "logout":
            existing.reason = "logout"
        await session.commit()
        return

    try:
        expires_at = datetime.fromtimestamp(int(payload["exp"]), tz=UTC)
    except (KeyError, ValueError, TypeError, OSError):
        expires_at = datetime.now(tz=UTC)
    session.add(RevokedToken(jti=jti, expires_at=expires_at, reason=reason))
    await session.commit()


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Выход")
async def logout(
    response: Response,
    session: SessionDep,
    crm_refresh: Annotated[str | None, Cookie()] = None,
) -> None:
    """Завершает сессию: стирает куку и отзывает обновляющий токен.

    Одного удаления куки мало: сам токен остаётся действительным до конца
    срока, и перехваченной копией можно было бы продлевать чужую сессию.
    Поэтому идентификатор токена попадает в чёрный список.
    """
    if crm_refresh:
        # Невалидный токен заносить в список нечего: просто стираем куку.
        with contextlib.suppress(jwt.PyJWTError):
            data = decode_token(crm_refresh, "refresh")
            jti = data.get("jti")
            if isinstance(jti, str) and jti:
                await advisory_xact_lock(session, namespace=REFRESH_LOCK_NAMESPACE, key=jti)
            await _revoke(session, data, reason="logout")

    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)


@router.get("/me", response_model=UserRead, summary="Текущий пользователь")
async def me(user: CurrentUser) -> User:
    return user
