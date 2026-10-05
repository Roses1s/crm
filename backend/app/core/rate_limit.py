"""Ограничение частоты запросов (slowapi).

Главная цель — не дать перебирать пароли на /auth/login.
Это ВТОРОЙ рубеж: в проде такой же лимит стоит и на nginx
(см. deploy/nginx/conf.d, зона `login`), он отсекает перебор раньше —
запрос не доходит до приложения, базы и Valkey. Здесь лимит остаётся на
случай, если запрос пришёл в обход nginx.

В тестах и локально ограничитель можно выключить: RATE_LIMIT_ENABLED=false.
"""

from __future__ import annotations

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
