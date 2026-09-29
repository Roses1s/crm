"""Ограничение частоты запросов (slowapi).

Главная цель — не дать перебирать пароли на /auth/login.
В тестах и локально ограничитель можно выключить: RATE_LIMIT_ENABLED=false.
"""

from __future__ import annotations

from collections.abc import Callable

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.rate_limit_default] if settings.rate_limit_enabled else [],
    enabled=settings.rate_limit_enabled,
    storage_uri=settings.valkey_url if settings.rate_limit_enabled else None,
    strategy="fixed-window",
    in_memory_fallback_enabled=True,
)


def login_limit() -> Callable[..., object]:
    """Декоратор лимита для ручки логина."""
    return limiter.limit(settings.rate_limit_login)
