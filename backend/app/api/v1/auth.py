"""Аутентификация: логин, обновление токена, текущий пользователь."""

from __future__ import annotations

from typing import Annotated

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
    verify_password,
)
from app.models.security import LoginAttempt
from app.models.user import User
from app.schemas.auth import AccessToken, LoginRequest
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])
log = get_logger(__name__)


# Кука уходит только на ручки аутентификации: остальным запросам она не нужна,
# а чем уже путь, тем меньше шансов утечь.
REFRESH_COOKIE = "crm_refresh"
COOKIE_PATH = "/api/v1/auth"


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

    ok = user is not None and verify_password(payload.password, user.hashed_password)
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

    if not ok or user is None:
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
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный refresh-токен"
        ) from exc

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Пользователь недоступен"
        )
    return _issue(user, response)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Выход")
async def logout(response: Response) -> None:
    """Стирает куку сессии: без неё продлить доступ уже нельзя."""
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)


@router.get("/me", response_model=UserRead, summary="Текущий пользователь")
async def me(user: CurrentUser) -> User:
    return user
