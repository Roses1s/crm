# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
#  Бэкенд CRM Detroid — Python 3.13, Gunicorn + UvicornWorker
#  Многоступенчатая сборка: инструменты компиляции остаются в builder-слое,
#  в финальный образ попадают только готовые зависимости.
# ---------------------------------------------------------------------------

FROM python:3.13-slim AS builder

ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pyproject.toml ./
# Пустая заглушка пакета: setuptools соберёт метаданные и поставит только
# зависимости. Благодаря этому слой с зависимостями кешируется и не
# пересобирается при каждом изменении кода — сам код копируется ниже.
RUN mkdir -p app && touch app/__init__.py \
    && python -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip setuptools wheel \
    && /opt/venv/bin/pip install .

# ---------------------------------------------------------------------------
FROM python:3.13-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:$PATH"

# postgresql-client нужен задаче резервного копирования (pg_dump).
# Ставим ИМЕННО 18-ю версию из официального репозитория PostgreSQL: pg_dump
# отказывается снимать дамп с сервера более новой версии, а в Debian лежит 17.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
         -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo $VERSION_CODENAME)-pgdg main" \
         > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends libpq5 postgresql-client-18 \
    && apt-get purge -y gnupg && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 app

COPY --from=builder /opt/venv /opt/venv

WORKDIR /app
COPY --chown=app:app . .

# Важно: --chown у COPY меняет владельца скопированных файлов, но не самого
# каталога /app — его создал WORKDIR от имени root. Без этого chown процесс
# под пользователем app не может создать в /app новый файл, и celery beat
# падает при попытке записать свою базу расписания.
#
# Каталог вложений создаём здесь же: docker переносит владельца из образа
# на пустой именованный том при первом монтировании.
RUN chown app:app /app \
    && mkdir -p /var/backups/crm /var/lib/crm/attachments \
    && chown -R app:app /var/backups/crm /var/lib/crm
USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

CMD ["gunicorn", "app.main:app", "-c", "gunicorn.conf.py"]
