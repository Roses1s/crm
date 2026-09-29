"""Настройки приложения.

Всё читается из переменных окружения (или файла .env рядом с backend/).
Ни одного секрета в коде: в продакшене значения приходят из окружения
контейнера, заданного в docker-compose.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "staging", "production"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- приложение -------------------------------------------------------
    app_name: str = "CRM Detroid API"
    api_prefix: str = "/api/v1"
    environment: Environment = "local"
    debug: bool = False
    log_level: str = "INFO"
    log_json: bool = True

    # --- безопасность -----------------------------------------------------
    secret_key: str = "dev-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 14
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"])

    # --- база данных ------------------------------------------------------
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_user: str = "crm"
    postgres_password: str = "crm"
    postgres_db: str = "crm"
    # Прямой DSN перекрывает разобранные по частям настройки (нужно тестам и CI).
    database_url: str | None = None
    db_pool_size: int = 10
    db_max_overflow: int = 20
    db_echo: bool = False

    # --- Valkey (кеш, брокер Celery) --------------------------------------
    valkey_url: str = "redis://valkey:6379/0"
    celery_broker_db: int = 1
    celery_result_db: int = 2
    cache_ttl_seconds: int = 60

    # --- ограничение частоты запросов -------------------------------------
    rate_limit_enabled: bool = True
    rate_limit_login: str = "10/minute"
    rate_limit_default: str = "300/minute"

    # --- резервные копии ---------------------------------------------------
    backup_dir: str = "/var/backups/crm"
    backup_keep_days: int = 14
    # Копия считается устаревшей, если её нет дольше этого срока.
    backup_stale_hours: int = 36

    # --- наблюдаемость ----------------------------------------------------
    sentry_dsn: str | None = None
    sentry_traces_sample_rate: float = 0.1

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_dsn(self) -> str:
        """Асинхронный DSN для SQLAlchemy."""
        if self.database_url:
            return self.database_url
        dsn = PostgresDsn.build(
            scheme="postgresql+asyncpg",
            username=self.postgres_user,
            password=self.postgres_password,
            host=self.postgres_host,
            port=self.postgres_port,
            path=self.postgres_db,
        )
        return str(dsn)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def alembic_dsn(self) -> str:
        """Синхронный DSN — Alembic и psql понимают его напрямую."""
        return self.sqlalchemy_dsn.replace("+asyncpg", "").replace("+aiosqlite", "")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def celery_broker_url(self) -> str:
        return self._valkey_db(self.celery_broker_db)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def celery_result_backend(self) -> str:
        return self._valkey_db(self.celery_result_db)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    def _valkey_db(self, db: int) -> str:
        base, _, _ = self.valkey_url.rpartition("/")
        return f"{base or self.valkey_url}/{db}"


@lru_cache
def get_settings() -> Settings:
    """Настройки читаются один раз за процесс."""
    return Settings()


settings = get_settings()
