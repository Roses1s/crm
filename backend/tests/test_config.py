"""Проверка guard'ов Settings для продакшен-конфигурации.

Settings читается один раз в conftest.py с ENVIRONMENT=local — поэтому здесь
создаём отдельные экземпляры Settings напрямую, в обход закэшированного
get_settings(), с разными ENVIRONMENT/SECRET_KEY/CORS_ORIGINS.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.config import Settings


def test_production_rejects_default_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", secret_key="dev-secret-change-me")


def test_production_rejects_short_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        Settings(environment="production", secret_key="short")


def test_production_rejects_localhost_cors() -> None:
    with pytest.raises(ValidationError, match="CORS_ORIGINS"):
        Settings(
            environment="production",
            secret_key="a" * 40,
            cors_origins=["http://localhost:5173"],
        )


def test_production_accepts_proper_config() -> None:
    settings = Settings(
        environment="production",
        secret_key="a" * 40,
        cors_origins=["https://crmdetroid.ru"],
    )
    assert settings.is_production is True


def test_local_environment_is_not_checked() -> None:
    """В local/staging короткий ключ — это нормально, туда CI и разработчики не лезут."""
    settings = Settings(environment="local", secret_key="dev-secret-change-me")
    assert settings.secret_key == "dev-secret-change-me"
