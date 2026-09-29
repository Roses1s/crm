# CRM Detroid

CRM для транспортной компании: лиды и воронка продаж канбаном, заявки на
перевозку, перевозчики, пользователи и отчёты. Работает на
**https://crmdetroid.ru**.

> **Новому участнику (человеку или ИИ-агенту):** начните с
> [`docs/PROJECT.md`](docs/PROJECT.md) — там весь контекст проекта, включая
> подводные камни и объяснение принятых решений.
> Короткая выжимка правил — в [`AGENTS.md`](AGENTS.md).

## Стек

| Слой | Технологии |
|---|---|
| ОС сервера | Ubuntu 26.04 LTS, 2 ГБ RAM, 15 ГБ диск |
| Хранилища | PostgreSQL 18 · Valkey 8 |
| Бэкенд | Python 3.13 · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2 · Celery 5.5 · structlog · slowapi · fastapi-cache2 |
| Фронтенд | React 19 · Vite 6 · Tailwind CSS v4 · TanStack Query v5 · React Router 7 · dnd-kit · Recharts |
| Инфраструктура | Docker Compose (7 контейнеров) · Gunicorn + UvicornWorker · Nginx 1.27 · Let's Encrypt |

## Что уже работает

| Раздел | Возможности |
|---|---|
| Вход | JWT, роли `admin` / `manager` / `operator`, журнал попыток входа |
| Канбан лидов | перетаскивание между этапами, поиск, фильтры (этап, тег, приоритет, архив, «мои лиды»), управление этапами, быстрое создание |
| Карточка лида | все поля с сохранением, теги, приоритет, статусбар этапов, пейджер, архивация |
| Чаттер | лента изменений, примечания, вложения с превью картинок |
| Активности | звонки, встречи, задачи со сроком; цветные часики на карточках канбана |
| Заявки | создание, правка, смена статуса, фильтр, связь с лидом |
| Админка | дашборд с графиком воронки, пользователи (CRUD), перевозчики, бэкапы, попытки входа |

История по этапам — в разделе 12 [`docs/PROJECT.md`](docs/PROJECT.md).

## Структура репозитория

```
AGENTS.md                   короткие правила для нового участника
docs/PROJECT.md             ← полный контекст проекта
docs/deploy/                инструкции: сервер с нуля и деплой
deploy.sh                   деплой одной командой (с автооткатом)
docker-compose.yml          весь стек: postgres · valkey · backend · worker · beat · frontend · nginx

backend/                    FastAPI
├── app/core/               конфиг, безопасность, логи, кеш, лимитер, ошибки, пагинация
├── app/models/             10 таблиц: users, stages, tags, leads, activities, shipments, …
├── app/api/v1/             auth · launcher · crm · attachments · activities · shipments · carriers · admin · health
├── app/worker/             Celery: бэкапы, архив вложений, напоминания, чистка
├── app/cli.py              createsuperuser и демо-данные
├── alembic/                3 миграции
└── tests/                  pytest, 42 теста на SQLite в памяти

frontend/                   React 19
├── src/app/                router, providers, layout (AppShell, Navbar, ControlPanel)
├── src/features/           auth · launcher · crm (board, list, lead-form) · shipments · admin
└── src/shared/             api (клиент, токены, хуки), ui, lib, types

deploy/                     инфраструктура сервера
├── nginx/conf.d/           боевые конфиги сайта
├── nginx/snippets/         TLS-параметры и заголовки безопасности
├── nginx/bootstrap/        временный HTTP-конфиг для первого выпуска сертификата
├── systemd/crm.service     автозапуск стека после перезагрузки
└── scripts/                deploy-hook Certbot (мягкая перезагрузка nginx)
```

## Запуск локально

```bash
cd backend
python -m venv .venv && .venv/bin/pip install -e ".[dev]"
export DATABASE_URL="sqlite+aiosqlite:///./crm.db"     # Postgres не нужен
.venv/bin/alembic upgrade head
.venv/bin/python -m app.cli createsuperuser --email admin@crmdetroid.ru --password DemoPass12345
.venv/bin/python -m app.cli seed
.venv/bin/uvicorn app.main:app --reload                # http://localhost:8000/docs

cd ../frontend && npm install && npm run dev           # http://localhost:5173
```

## Запуск всего стека в Docker

```bash
cp .env.example .env     # заполнить SECRET_KEY и POSTGRES_PASSWORD
docker compose up -d --build
docker compose exec backend python -m app.cli createsuperuser --email you@example.com --password ...
```

## Обновление продакшена

```bash
ssh crm /opt/crm/deploy.sh      # со своего компьютера
cd /opt/crm && ./deploy.sh      # или на сервере
```

`deploy.sh` обновляет код, собирает образы, ждёт готовности контейнеров,
проверяет сайт снаружи и **откатывается сам**, если релиз не поднялся.
Флаги: `--status`, `--no-build`, `--skip-pull`, `--rollback`, `--help`.

## Продакшен

- Домен: https://crmdetroid.ru (редиректы с `www` и с `http`)
- Сервер: vps.sweb.ru, `77.222.38.191`, Ubuntu 26.04 LTS
- Каталог приложения: `/opt/crm` (клон этого репозитория)
- Автозапуск: `systemctl status crm.service`
- Бэкапы: `pg_dump` ежедневно в 03:00, хранение 14 дней; архив вложений — еженедельно
