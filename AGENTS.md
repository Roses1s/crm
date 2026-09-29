# Инструкция для агента (и для нового разработчика)

**Начните с [`docs/PROJECT.md`](docs/PROJECT.md)** — там весь контекст: архитектура,
доменная модель, API, эксплуатация, подводные камни и журнал решений.
Этот файл — короткая выжимка, чтобы не наделать типовых ошибок в первые минуты.

## Проект в пяти строках

CRM для транспортной компании: лиды, канбан-воронка, заявки на перевозку,
перевозчики, пользователи, отчёты. Работает на **https://crmdetroid.ru**.
Бэкенд — FastAPI + PostgreSQL 18, фронтенд — React 19 + Vite 6 + Tailwind v4,
всё в Docker Compose (7 контейнеров) на VPS с 2 ГБ памяти.
Каталог `/opt/crm` на сервере — это клон данного репозитория.

## Жёсткие правила

1. **Всё по-русски**: комментарии, docstring'и, сообщения об ошибках, коммиты,
   документация, ответы в чате. Владелец — не администратор, объяснять простым
   языком, команды давать готовыми к копированию.
2. **Ветка только `arena/01a0eb16-crm`.** В другие ветки не коммитить и не пушить.
3. **Не вносить изменения, которые нельзя проверить.** В песочнице нет Docker,
   Postgres, Valkey и `sudo` — проверяйте тем, что доступно: pytest на SQLite,
   `ruff`, `mypy`, `tsc`, `vite build`, запуск uvicorn на SQLite.
4. **Секреты не коммитить.** `.env` в `.gitignore`, в примерах — заглушки.
5. **Наружу публикуется только nginx (80/443).** Docker обходит UFW: любой
   `ports:` у базы делает её публичной.

## Проверки перед тем, как сказать «готово»

```bash
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . \
  && .venv/bin/mypy app && .venv/bin/python -m pytest
cd ../frontend && npx tsc -b && npm run build
```

Нет `.venv` или `node_modules` — это нормально, песочница их не сохраняет:

```bash
cd backend && python -m venv .venv && .venv/bin/pip install -e ".[dev]"
cd ../frontend && npm install
```

Локальная git-история могла откатиться, хотя на GitHub всё на месте:

```bash
git fetch origin arena/01a0eb16-crm && git reset FETCH_HEAD && git status --short
```

## Пять самых частых граблей

| Грабли | Как правильно |
|---|---|
| Alembic автогенерирует миграцию на SQLite | Заменить `sa.text("(CURRENT_TIMESTAMP)")` на `sa.func.now()` и развернуть `batch_alter_table` в обычные `op.create_index` |
| Задачи Celery и БД | Синхронный движок, драйвер `psycopg` (`settings.sync_dsn`), создавать лениво; `pg_dump` берёт `settings.plain_dsn` |
| Данные после `PATCH` приходят старые | Добавить `.execution_options(populate_existing=True)` |
| Классы Tailwind из v3 | В v4 `shadow-sm`→`shadow-xs`, `rounded`→`rounded-[4px]`; тема — `@theme inline` + `@custom-variant dark` |
| Выдуманные ИНН в тестах | Проверяется контрольная сумма ФНС — пересчитывайте последнюю цифру |

Полный список — раздел «Подводные камни» в [`docs/PROJECT.md`](docs/PROJECT.md).

## Куда смотреть дальше

| Документ | О чём |
|---|---|
| [`docs/PROJECT.md`](docs/PROJECT.md) | полный контекст проекта |
| [`docs/deploy/01-server-setup.md`](docs/deploy/01-server-setup.md) | сервер с нуля: SSH, UFW, Docker, TLS |
| [`docs/deploy/02-deploy.md`](docs/deploy/02-deploy.md) | деплой, `deploy.sh`, чек-лист, частые проблемы |
| [`backend/README.md`](backend/README.md) | API, модели, активности, вложения, Celery |
| [`frontend/README.md`](frontend/README.md) | дизайн-система, структура, работа с API |
