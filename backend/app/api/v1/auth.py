"""Аутентификация: логин, обновление токена, текущий пользователь."""

from __future__ import annotations

import jwt
from fastapi import APIRouter, HTTPException, Request, status
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
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPair
from app.schemas.user import UserRead

router = APIRouter(prefix="/auth", tags=["auth"])
log = get_logger(__name__)


def _tokens(user: User) -> TokenPair:
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        expires_in=settings.access_token_ttl_minutes * 60,
    )


@router.post("/login", response_model=TokenPair, summary="Вход по email и паролю")
@limiter.limit(settings.rate_limit_login)
async def login(request: Request, payload: LoginRequest, session: SessionDep) -> TokenPair:
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
    return _tokens(user)


@router.post("/refresh", response_model=TokenPair, summary="Обновить пару токенов")
async def refresh(payload: RefreshRequest, session: SessionDep) -> TokenPair:
    try:
        data = decode_token(payload.refresh_token, "refresh")
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
    return _tokens(user)


@router.get("/me", response_model=UserRead, summary="Текущий пользователь")
async def me(user: CurrentUser) -> User:
    return user
