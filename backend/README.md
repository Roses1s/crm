# Бэкенд CRM Detroid

FastAPI · SQLAlchemy 2.0 (async) · PostgreSQL 18 · Alembic · Celery 5.5 + Valkey 8 · Python 3.13

## Быстрый старт (локально)

```bash
cd backend
python -m venv .venv
.venv/bin/pip install -e ".[dev]"
# воспроизводимая установка (так ставит CI):
#   .venv/bin/pip install --require-hashes -r requirements-dev.lock
#   .venv/bin/pip install -e . --no-deps
cp .env.example .env            # при необходимости поправить

# схема БД
.venv/bin/alembic upgrade head

# администратор и демо-данные
.venv/bin/python -m app.cli createsuperuser --email admin@crmdetroid.ru --password ВашПароль
.venv/bin/python -m app.cli seed

# запуск
.venv/bin/uvicorn app.main:app --reload
```

Документация API: http://localhost:8000/docs (в продакшене отключается).

Без PostgreSQL можно поднять всё на SQLite — удобно для быстрой проверки:

```bash
export DATABASE_URL="sqlite+aiosqlite:///./crm.db"
```

## Проверки

```bash
.venv/bin/ruff check .        # линтер
.venv/bin/ruff format .       # форматирование
.venv/bin/mypy app            # типы (strict)
.venv/bin/python -m pytest    # тесты (77 шт., идут на SQLite в памяти)
.venv/bin/alembic check       # модели и миграции совпадают
.venv/bin/pip-audit           # уязвимости в зависимостях
```

## Структура

```
backend/
├── app/
│   ├── main.py            create_app: middleware, обработчики ошибок, lifespan
│   ├── cli.py             createsuperuser / seed
│   ├── core/
│   │   ├── config.py      pydantic-settings: всё из переменных окружения
│   │   ├── security.py    bcrypt + JWT (access / refresh)
│   │   ├── logging.py     structlog: JSON в проде, цветной вывод локально
│   │   ├── cache.py       fastapi-cache2 поверх Valkey (fallback — память)
│   │   ├── rate_limit.py  slowapi: защита /auth/login от перебора (2-й рубеж после nginx)
│   │   ├── errors.py      единый формат ошибок {detail, code, request_id}
│   │   └── pagination.py  {count, next, previous, results}
│   ├── db/                Base с naming_convention, async engine, сессия-зависимость
│   ├── models/            User · Stage · Tag · Lead · Carrier · Shipment · TimelineEntry ·
│   │                      Attachment · LoginAttempt · RevokedToken
│   ├── schemas/           Pydantic v2: запросы и ответы
│   ├── api/
│   │   ├── deps.py        сессия, текущий пользователь, проверка ролей
│   │   └── v1/            ТОЛЬКО HTTP: маршруты, параметры, коды ответов
│   │                      auth · launcher · stages · tags · leads · shipments ·
│   │                      attachments · carriers · users · admin · health
│   ├── services/          бизнес-логика, отделённая от HTTP: leads · shipments · attachments
│   └── worker/            Celery: приложение и задачи (бэкапы, уборка)
├── alembic/               миграции (первая создаёт всю схему)
├── tests/                 pytest + httpx ASGITransport
├── requirements-dev.lock  точные версии зависимостей с хешами (для CI)
├── Dockerfile             многоступенчатая сборка на Python 3.13
└── gunicorn.conf.py       Gunicorn 23 + UvicornWorker
```

## Маршруты

| Метод | Путь | Кто может |
|---|---|---|
| POST | `/api/v1/auth/login` | все (лимит 10/мин) |
| POST | `/api/v1/auth/refresh` | по куке `crm_refresh` (HttpOnly) |
| POST | `/api/v1/auth/logout` | все (стирает куку и отзывает обновляющий токен) |
| GET | `/api/v1/auth/me` | авторизованные |
| GET | `/api/v1/launcher/apps` | авторизованные (фильтр по роли) |
| GET/POST/PATCH/DELETE | `/api/v1/crm/stages` | своя доска; `?owner_id=` — доска сотрудника (админ) |
| GET/POST/DELETE | `/api/v1/crm/tags` | чтение — все, изменение — админ |
| GET/POST | `/api/v1/crm/leads` | свои лиды; админ видит все |
| GET/PATCH | `/api/v1/crm/leads/{id}` | свой лид; чужой — 404 |
| DELETE | `/api/v1/crm/leads/{id}` | свой лид (архивация) |
| GET | `/api/v1/crm/leads/{id}/timeline` | авторизованные |
| POST | `/api/v1/crm/leads/{id}/notes` | авторизованные |
| GET | `/api/v1/crm/leads/{id}/pager` | считает только видимые лиды |
| POST | `/api/v1/crm/leads/{id}/transfer` | передать лид коллеге (свой лид) |
| GET | `/api/v1/users/colleagues` | список активных сотрудников (имя и фамилия) |
| GET/POST | `/api/v1/crm/leads/{id}/attachments` | авторизованные (до 25 МБ) |
| GET/DELETE | `/api/v1/crm/attachments/{id}` | по доступу к лиду; удалить — автор или админ |
| GET/POST | `/api/v1/shipments/{id}/attachments` | документы заявки |
| GET/POST | `/api/v1/shipments` | авторизованные |
| GET/PATCH | `/api/v1/shipments/{id}` | авторизованные |
| PATCH | `/api/v1/shipments/{id}/status` | авторизованные |
| GET | `/api/v1/leads/{id}/shipments` | авторизованные |
| GET/POST/PATCH | `/api/v1/carriers` | чтение и создание — все, правка — админ |
| GET | `/api/v1/admin/backups` · POST `/api/v1/admin/backup` | admin |
| GET | `/api/v1/admin/login-attempts` | admin |
| GET/POST/PATCH/DELETE | `/api/v1/admin/users` | admin |
| GET | `/health`, `/health/ready` | без авторизации |

## Решения, которые стоит знать

**Роли.** Две роли (`admin` / `manager`) проверяются зависимостью
`require_roles(...)`, а не внутри обработчиков — права видно прямо в сигнатуре.

**Личные доски.** Этап принадлежит сотруднику (`stages.owner_id`), лид —
ответственному (`leads.assigned_to_id`). Менеджер видит только свои карточки:
чужие отдаются как 404, чтобы по коду ответа нельзя было узнать об их
существовании. Администратор видит все и может открыть доску любого сотрудника
параметром `?owner_id=`. Стандартная воронка создаётся при первом обращении к
`/crm/stages` (`ensure_default_stages`).

**Сессия.** Обновляющий токен уходит в куку `HttpOnly` с путём `/api/v1/auth` —
скрипты страницы его не прочитают. В теле ответа только короткий токен доступа
(30 минут), фронтенд держит его в памяти вкладки.

**Формат ответов.** Списки отдаются как `{count, next, previous, results}` —
ровно то, что уже умеет читать фронтенд. Ошибки всегда `{detail, code, request_id}`.

**История изменений.** Смена этапа лида автоматически пишет запись в
`timeline_entries` — из неё строится лента чаттера в карточке.

**Валидация ИНН.** Контрольная сумма ФНС проверяется в схеме (10 и 12 цифр),
в базе дополнительно стоит CHECK на длину.

**Enum'ы.** Хранятся как VARCHAR + CHECK (`native_enum=False`): добавить новый
статус можно обычной миграцией, без `ALTER TYPE`, и схема работает в SQLite.

**Кеш и лимитер** не роняют приложение: если Valkey недоступен, кеш уходит
в память процесса, а slowapi — на in-memory хранилище.

**Вложения.** Файлы лежат в томе `attachments` (`/var/lib/crm/attachments/<lead_id>/<uuid>.<ext>`),
метаданные — в таблице `attachments`. На диск попадает обезличенное имя: так исключены
совпадения и подстановка пути. Скачивание идёт через API с проверкой токена, причём
картинки и PDF отдаются с `Content-Disposition: inline`, а всё остальное — только
`attachment` + `X-Content-Type-Options: nosniff`, чтобы html-файл не выполнился в браузере.
Лимит 25 МБ проверяется потоково, по мегабайту, и совпадает с `client_max_body_size` nginx.

**bcrypt < 5.** passlib 1.7.4 несовместим с bcrypt 5.0 (падает при определении
бэкенда), поэтому версия зафиксирована в зависимостях.

## Celery

```bash
celery -A app.worker.celery_app.celery worker -l info
celery -A app.worker.celery_app.celery beat   -l info
```

| Задача | Расписание | Что делает |
|---|---|---|
| `backup_database` | 03:00 ежедневно | `pg_dump` в `/var/backups/crm`, хранит 14 дней |
| `backup_attachments` | воскресенье 04:00 | архив файлов (`files-*.tar.gz`), хранит 4 копии |
| `cleanup_orphan_attachments` | воскресенье 04:30 | чистит записи о пропавших файлах |

## Миграции

```bash
.venv/bin/alembic revision --autogenerate -m "описание"
.venv/bin/alembic upgrade head
.venv/bin/alembic downgrade -1
```

Первая миграция (`initial schema`) создаёт все девять таблиц, индексы,
внешние ключи и CHECK-ограничения.
