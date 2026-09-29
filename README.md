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
| 2 | Фронтенд (Vite 6 + Tailwind v4 + React 19) | ✅ готово — [`frontend/`](frontend/README.md) |
| 3 | Скелет FastAPI (SQLAlchemy async + Alembic + Celery + Valkey) | ✅ готово — [`backend/`](backend/README.md) |
| 4 | Полный `docker-compose.yml` и деплой на `crmdetroid.ru` | ✅ готово — [инструкция](docs/deploy/02-deploy.md) |
| 5 | Мутации: формы, канбан drag-and-drop, CRUD справочников | ✅ готово |

## Структура репозитория

```
backend/                    # FastAPI: SQLAlchemy 2.0 async, Alembic, Celery, JWT
├── app/core/               конфиг, безопасность, логи, кеш, лимитер, ошибки
├── app/models/             9 таблиц: users, stages, tags, leads, shipments, ...
├── app/api/v1/             auth · crm · shipments · carriers · admin · health
├── app/worker/             Celery: бэкапы, напоминания, чистка вложений
├── alembic/                миграции (схема + журнал попыток входа)
└── tests/                  pytest (25 тестов, SQLite в памяти)

docker-compose.yml          # весь стек: postgres · valkey · backend · worker · beat · frontend · nginx

frontend/                   # React 19 + Vite 6 + Tailwind v4, данные из API
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

## Запуск всего стека

```bash
cp .env.example .env     # заполнить SECRET_KEY и POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec backend python -m app.cli createsuperuser --email you@example.com --password ...
```

## Продакшен

- Домен: https://crmdetroid.ru (+ редирект с `www` и с `http`)
- Сервер: vps.sweb.ru, `77.222.38.191`, Ubuntu 26.04 LTS
- Каталог приложения на сервере: `/opt/crm`
- Автозапуск: `systemctl status crm.service`
- Стек на сервере: Docker 29.8.1 · Compose v5.5.1 · Nginx 1.27.5 · TLS Let's Encrypt
