"""Настройки приложения.

Всё читается из переменных окружения (или файла .env рядом с backend/).
Ни одного секрета в коде: в продакшене значения приходят из окружения
контейнера, заданного в docker-compose.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, PostgresDsn, computed_field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

Environment = Literal["local", "staging", "production"]

# Значение из примера .env и дефолт в коде — если дошло до production as is,
# значит кто-то забыл переопределить переменную окружения.
_INSECURE_DEFAULT_SECRET_KEYS = {"dev-secret-change-me", "test-secret", "ЗАМЕНИТЕ_МЕНЯ"}
_MIN_SECRET_KEY_LENGTH = 32  # см. рекомендацию PyJWT/RFC 7518 §3.2 для HS256


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- приложение -------------------------------------------------------
    app_name: str = "CRM Детроид API"
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
    # Бюджет соединений с Postgres считается так:
    #   GUNICORN_WORKERS * (db_pool_size + db_max_overflow)
    #   + запас на Celery worker/beat и ручные psql/alembic-сессии
    #   <= max_connections из команды postgres в docker-compose.yml.
    # Сейчас: 3 воркера * (10 + 20) = 90, + ~15 от Celery (свой движок с
    # дефолтным QueuePool) + запас — против max_connections=120. Если меняете
    # GUNICORN_WORKERS или эти два числа, пересчитайте max_connections заодно,
    # иначе под нагрузкой можно упереться в лимит соединений Postgres.
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

    # --- вложения ----------------------------------------------------------
    attachments_dir: str = "/var/lib/crm/attachments"
    # Должно совпадать с client_max_body_size в конфиге nginx.
    max_upload_mb: int = 25

    # --- резервные копии ---------------------------------------------------
    backup_dir: str = "/var/backups/crm"
    backup_keep_days: int = 14
    # Копия считается устаревшей, если её нет дольше этого срока.
    backup_stale_hours: int = 36
    # Файлы вложений архивируются отдельно и реже: дамп базы их не содержит.
    backup_files_keep: int = 4

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
    def sync_dsn(self) -> str:
        """Синхронный DSN для Celery: asyncpg там не работает, нужен psycopg 3."""
        return self.sqlalchemy_dsn.replace("+asyncpg", "+psycopg").replace("+aiosqlite", "")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def plain_dsn(self) -> str:
        """URL без драйвера — его понимают pg_dump и psql."""
        return (
            self.sqlalchemy_dsn.replace("+asyncpg", "")
            .replace("+psycopg", "")
            .replace("+aiosqlite", "")
        )

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

    @model_validator(mode="after")
    def _fail_fast_on_insecure_production_config(self) -> Settings:
        """Не даёт приложению тихо стартовать в проде с «забытыми» настройками.

        Раньше эти две ошибки конфигурации ничем не отличались от штатного
        запуска: сервер поднимался и работал, просто подписывал токены
        публично известным ключом из репозитория или принимал запросы с
        dev-адреса. Обе ошибки обнаружились бы не при деплое, а гораздо позже
        и далеко не сразу. Здесь — явный отказ стартовать, с понятным текстом
        прямо в `docker compose logs`.
        """
        if not self.is_production:
            return self

        if (
            self.secret_key in _INSECURE_DEFAULT_SECRET_KEYS
            or len(self.secret_key) < _MIN_SECRET_KEY_LENGTH
        ):
            raise ValueError(
                "SECRET_KEY не задан или короче 32 байт при ENVIRONMENT=production. "
                "Сгенерировать: openssl rand -hex 32 (см. .env.example)."
            )

        if any("localhost" in origin or "127.0.0.1" in origin for origin in self.cors_origins):
            raise ValueError(
                "CORS_ORIGINS содержит localhost/127.0.0.1 при ENVIRONMENT=production — "
                "похоже, переменная окружения не переопределена (см. .env.example)."
            )

        return self


@lru_cache
def get_settings() -> Settings:
    """Настройки читаются один раз за процесс."""
    return Settings()


settings = get_settings()
