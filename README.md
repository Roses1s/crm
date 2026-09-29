# CRM Detroid

CRM-система: React 19 + FastAPI + PostgreSQL 18, разворачивается в Docker Compose
на `crmdetroid.ru`.

## Стек

| Слой | Технологии |
|---|---|
| ОС | Ubuntu 26.04 LTS |
| БД | PostgreSQL 18 · Valkey 8 |
| Backend | Python 3.13 · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2 · Celery 5.5 · structlog |
| Frontend | React 19 · Vite 6 · Tailwind CSS v4 · Zustand 5 · TanStack Query v5 · zod · react-hook-form |
| Infra | Docker Compose · Gunicorn 23 + UvicornWorker · Nginx 1.27 · Let's Encrypt |

## Этапы работ

| Этап | Что делаем | Статус |
|---|---|---|
| 1 | Настройка VPS с нуля: безопасность → Docker → Nginx 1.27 → SSL | ✅ готово — [инструкция](docs/deploy/01-server-setup.md) |
| 2 | Фронтенд-макет (Vite 6 + Tailwind v4 + React 19), только вёрстка на моках | ✅ готово — [`frontend/`](frontend/README.md) |
| 3 | Скелет FastAPI (SQLAlchemy async + Alembic + Celery + Valkey) | ✅ готово — [`backend/`](backend/README.md) |
| 4 | Полный `docker-compose.yml` и деплой на `crmdetroid.ru` | 🔜 следующий |

## Структура репозитория

```
backend/                    # FastAPI: SQLAlchemy 2.0 async, Alembic, Celery, JWT
├── app/core/               конфиг, безопасность, логи, кеш, лимитер, ошибки
├── app/models/             9 таблиц: users, stages, tags, leads, shipments, ...
├── app/api/v1/             auth · crm · shipments · carriers · admin · health
├── app/worker/             Celery: бэкапы, напоминания, чистка вложений
├── alembic/                миграции
└── tests/                  pytest (22 теста, SQLite в памяти)

frontend/                   # визуальный макет: React 19 + Vite 6 + Tailwind v4 (на моках)
├── src/app/                # router, providers, layout (AppShell, Navbar, ControlPanel)
├── src/features/           # auth · launcher · crm · shipments · admin
└── src/shared/             # ui-компоненты, моковые данные, типы, утилиты

deploy/                     # инфраструктура (зеркало каталога /opt/crm на сервере)
├── docker-compose.yml      # этап 1: nginx-шлюз; этап 4: весь стек
├── nginx/
│   ├── conf.d/             # боевые конфиги (общие настройки + сайт с HTTPS)
│   ├── bootstrap/          # временный HTTP-конфиг для первичного выпуска сертификата
│   └── snippets/           # TLS-параметры и заголовки безопасности
├── www/                    # статическая заглушка до появления фронтенда
└── scripts/                # deploy-hook Certbot (reload nginx после продления)

docs/deploy/                # пошаговые инструкции по развёртыванию
└── 01-server-setup.md      # этап 1: настройка сервера с нуля
```

## Продакшен

- Домен: https://crmdetroid.ru (+ редирект с `www` и с `http`)
- Сервер: vps.sweb.ru, `77.222.38.191`, Ubuntu 26.04 LTS
- Каталог приложения на сервере: `/opt/crm`
- Автозапуск: `systemctl status crm.service`
- Стек на сервере: Docker 29.8.1 · Compose v5.5.1 · Nginx 1.27.5 · TLS Let's Encrypt
