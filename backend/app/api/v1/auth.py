"""Аутентификация: вход, продление и завершение сессии, текущий пользователь.

Токен доступа живёт полчаса и приходит в теле ответа, обновляющий — в куке
HttpOnly. В чёрный список (`revoked_tokens`) токен попадает в двух случаях:

* **выход из системы** — действует сразу, перехваченной копией сессию уже не
  продлить;
* **продление сессии** — выдавая новый токен, прежний сразу отзываем
  (ротация). У этого случая есть короткое окно снисхождения
  `REFRESH_GRACE_SECONDS`: вкладки могут продлить сессию почти одновременно,
  и второй запрос не должен выбрасывать человека на страницу входа.

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


# Кука уходит только на ручки аутентификации: остальным запросам она не нужна,
# а чем уже путь, тем меньше шансов утечь.
REFRESH_COOKIE = "crm_refresh"
COOKIE_PATH = "/api/v1/auth"

# Сколько секунд прежний обновляющий токен ещё принимается после ротации.
# Нужно из-за гонки: вкладка может послать несколько запросов продления почти
# одновременно (разные запросы получили 401 в одну секунду). Без окна второй
# из них увидел бы «Сессия завершена» и выбросил человека на страницу входа.
REFRESH_GRACE_SECONDS = 15
REFRESH_LOCK_NAMESPACE = 4229

# Заведомо несовпадающий хеш: сверяем пароль с ним, когда пользователя нет,
# чтобы время ответа не выдавало существование учётной записи.
_DUMMY_HASH = hash_password("несуществующий-пароль-для-постоянного-времени")


def _issue(user: User, response: Response) -> AccessToken:
    """Выдаёт короткий токен доступа и кладёт обновляющий в куку HttpOnly."""
    response.set_cookie(
        REFRESH_COOKIE,
        create_refresh_token(user.id),
        max_age=settings.refresh_token_ttl_days * 24 * 3600,
        path=COOKIE_PATH,
        httponly=True,
        # В продакшене сайт только по HTTPS; в разработке без этого кука
        # не сохранилась бы на http://localhost.
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
    # request нужен slowapi для определения клиента — поэтому он в сигнатуре.
    user = (
        await session.execute(select(User).where(User.email == payload.email.lower()))
    ).scalar_one_or_none()

    # Пароль сверяем всегда — даже когда такого пользователя нет. Иначе ответ
    # на несуществующий email приходил заметно быстрее, и по времени ответа
    # можно было собрать список настоящих учётных записей.
    password_ok = verify_password(payload.password, user.hashed_password if user else _DUMMY_HASH)
    # В журнале «успехом» считается только вход, который реально состоялся:
    # отключённой учётной записи сервер отвечает отказом, значит и в журнале
    # это неудачная попытка (иначе она не попадала в раздел «Безопасность»).
    ok = user is not None and password_ok and user.is_active
    # Каждая попытка попадает в журнал — из него строится раздел «Безопасность».
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

    # Два запроса с одной кукой (обычно из разных вкладок) могут одновременно
    # пройти проверку и вставить одну строку в revoked_tokens. PostgreSQL
    # сериализует их по jti; второй после ожидания увидит свежую ротацию и
    # попадёт в окно снисхождения вместо ошибки уникальности.
    await advisory_xact_lock(session, namespace=REFRESH_LOCK_NAMESPACE, key=jti)

    # Токен, по которому уже вышли из системы, продлевать нельзя — даже если
    # срок его жизни ещё не истёк и кто-то успел его перехватить.
    if await _is_revoked_beyond_grace(session, jti):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Сессия завершена")

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь недоступен"
        )

    # Ротация: выдавая новый обновляющий токен, прежний сразу отзываем. Без
    # этого один раз перехваченная кука оставалась рабочей все 14 дней, сколько
    # бы раз настоящий пользователь ни продлевал сессию.
    await _revoke(session, data, reason="rotation")
    return _issue(user, response)


async def _revoked_entry(session: SessionDep, jti: str | None) -> RevokedToken | None:
    if not jti:
        return None
    found = await session.execute(select(RevokedToken).where(RevokedToken.jti == jti))
    return found.scalar_one_or_none()


async def _is_revoked_beyond_grace(session: SessionDep, jti: str | None) -> bool:
    """Отозван ли токен настолько давно, что продлевать по нему уже нельзя.

    Свежий отзыв (меньше `REFRESH_GRACE_SECONDS` назад) — это почти наверняка
    собственная параллельная вкладка, а не перехват: такой запрос пропускаем.
    """
    entry = await _revoked_entry(session, jti)
    if entry is None:
        return False
    # Выход из системы действует сразу: окно снисхождения — только для замены
    # токена при продлении сессии.
    if entry.reason != "rotation":
        return True
    revoked_at = entry.created_at
    if revoked_at.tzinfo is None:  # SQLite хранит время без часового пояса
        revoked_at = revoked_at.replace(tzinfo=UTC)
    return (datetime.now(tz=UTC) - revoked_at).total_seconds() > REFRESH_GRACE_SECONDS


async def _revoke(session: SessionDep, payload: dict[str, Any], reason: str) -> None:
    """Заносит обновляющий токен в чёрный список (до его собственного срока)."""
    jti = str(payload.get("jti") or "")
    if not jti:
        return

    existing = await _revoked_entry(session, jti)
    if existing is not None:
        # Выход перекрывает короткое окно снисхождения, если успел начаться
        # одновременно с ротацией той же куки: токен сразу становится недействительным.
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
        # Негодный токен отзывать нечего — просто стираем куку.
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
