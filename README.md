# CRM Detroid

CRM для транспортной компании: у каждого менеджера личная воронка продаж
канбаном, заявки на перевозку с документами, справочник перевозчиков и
управление сотрудниками. Работает на **https://crmdetroid.ru**.

> **Передаёте проект новому агенту?** Отправьте ему первым сообщением готовый
> текст из [`docs/MASTER_PROMPT.md`](docs/MASTER_PROMPT.md) — он сам прочитает
> документацию и сверит текущее состояние.
>
> **Новому участнику (человеку или ИИ-агенту):** начните с
> [`AGENTS.md`](AGENTS.md) → [`docs/PROJECT.md`](docs/PROJECT.md) (полный
> контекст, подводные камни, журнал решений) → [`docs/STATUS.md`](docs/STATUS.md)
> (на каком этапе проект сейчас).

## Стек

| Слой | Технологии |
|---|---|
| ОС сервера | Ubuntu 26.04 LTS, 2 ГБ RAM, 15 ГБ диск |
| Хранилища | PostgreSQL 18 · Valkey 8 |
| Бэкенд | Python 3.13 · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2 · Celery 5.5 · structlog · slowapi · fastapi-cache2 |
| Фронтенд | React 19 · Vite 6 · Tailwind CSS v4 · TanStack Query v5 · React Router 7 · dnd-kit · Vitest |
| Инфраструктура | Docker Compose (7 контейнеров) · Gunicorn + UvicornWorker · Nginx 1.27 · Let's Encrypt |

## Что уже работает

| Раздел | Возможности |
|---|---|
| Вход | JWT: обновляющий токен в куке `HttpOnly`, токен доступа только в памяти вкладки; две роли — администратор и менеджер; журнал попыток входа |
| Личные доски | у каждого менеджера своя воронка: стандартные этапы при первом входе, переименование, порядок, удаление с переносом карточек; чужие лиды не видны |
| Канбан лидов | перетаскивание между этапами, поиск по названию, ИНН, контакту и телефону, быстрое создание |
| Карточка лида | все поля с сохранением, теги, приоритет, статусбар этапов, пейджер, архивация |
| Чаттер | лента изменений, примечания, вложения с превью картинок и PDF |
| Заявки | создание, правка, смена статуса, фильтр, связь с лидом, документы заявки |
| Админка | пользователи (при удалении лиды переходят администратору), перевозчики, бэкапы, попытки входа |
| Доски сотрудников | администратор набирает фамилию в поиске и открывает воронку любого сотрудника |

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
├── app/models/             users, stages, tags, leads, timeline, attachments, shipments, carriers, security
├── app/api/v1/             auth · launcher · stages · leads · attachments · shipments · carriers · tags · admin · health
├── app/worker/             Celery: бэкапы, архив вложений, напоминания о звонках, чистка
├── app/cli.py              createsuperuser, seed, resetboard (сброс доски к стандартной)
├── alembic/                8 миграций
└── tests/                  pytest, 57 тестов на SQLite в памяти

frontend/                   React 19
├── src/app/                router, providers, layout (AppShell, Navbar, ControlPanel)
├── src/features/           auth · launcher · crm (board, list, lead-form) · shipments · admin
├── src/shared/             api (клиент, сессия, хуки), ui, lib, types
└── src/test/               окружение Vitest; тестов интерфейса — 7

deploy/                     инфраструктура сервера
├── nginx/conf.d/           боевые конфиги сайта
├── nginx/snippets/         TLS-параметры и заголовки безопасности
├── nginx/bootstrap/        временный HTTP-конфиг для первого выпуска сертификата
├── systemd/crm.service     автозапуск стека после перезагрузки
├── restore-test.sh         учебное восстановление из бэкапа во временную базу
└── scripts/                deploy-hook Certbot (мягкая перезагрузка nginx)

.github/workflows/          автопроверки: ruff, mypy, pytest, миграции, tsc, vitest, сборка
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

## Проверки перед отправкой кода

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/mypy app && .venv/bin/python -m pytest
cd frontend && npx tsc -b && npm test && npm run build
```

То же самое GitHub Actions прогоняет автоматически при каждой отправке.

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
- Проверка бэкапа: `ssh crm "cd /opt/crm && ./deploy/restore-test.sh"` — разворачивает
  свежую копию во временную базу и удаляет её за собой (последняя проверка — 29.09.2026)
- Доступ по SSH: только по ключам, пользователь `deploy`; как добавить новый
  компьютер — в [`docs/deploy/01-server-setup.md`](docs/deploy/01-server-setup.md)
