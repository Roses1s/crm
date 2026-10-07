# CRM Detroid

CRM для транспортной компании: у каждого менеджера личная воронка продаж
канбаном, заявки на перевозку с документами, общий список клиентов и
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
| ОС сервера | Ubuntu 26.04 LTS, 4 ГБ RAM, 15 ГБ диск |
| Хранилища | PostgreSQL 18 · Valkey 8 |
| Бэкенд | Python 3.13 · FastAPI · SQLAlchemy 2.0 (async) · Alembic · Pydantic v2 · Celery 5.5 · structlog · slowapi · fastapi-cache2 |
| Фронтенд | React 19 · Vite 6 · Tailwind CSS v4 · TanStack Query v5 · React Router 7 · dnd-kit · Vitest |
| Инфраструктура | Docker Compose (7 контейнеров) · Gunicorn + UvicornWorker · Nginx 1.30 · Let's Encrypt |

## Что уже работает

| Раздел | Возможности |
|---|---|
| Вход | JWT: обновляющий токен в куке `HttpOnly` (при продлении сессии прежний отзывается), токен доступа только в памяти вкладки; две роли — администратор и менеджер; журнал попыток входа |
| Продавец | назначается автоматически при создании; передача коллеге по щелчку на имени, с подтверждением и записью в ленте |
| Личные доски | у каждого менеджера своя воронка: стандартные этапы при первом входе, переименование, порядок, удаление с переносом карточек; чужие лиды не видны |
| Канбан лидов | перетаскивание между этапами и перестановка самих этапов, поиск по названию, ИНН, контакту и телефону, быстрое создание |
| Карточка лида | название, ИНН, контакты логиста, теги, бухгалтер из фиксированного списка (отдельно от продавца), приоритет, статусбар этапов, пейджер, архивация, автосохранение через 3 с простоя, защита от параллельной перезаписи и потери правок при переходе |
| Проигрыш лида | причина из справочника, ленточка на карточке, чужой проигранный лид может забрать себе любой сотрудник |
| Клиенты | все лиды компании плиткой; чужой активный лид виден только по названию, ИНН и продавцу |
| Чаттер | лента изменений, примечания, вложения с превью картинок и PDF; миниатюры загружаются по мере прокрутки (не больше 3 одновременно); файл можно приложить при создании и правке записи; системные записи править нельзя, удалить можно только запись о смене этапа (любому сотруднику) |
| Заявки | номер, создание, правка, смена статуса, поиск, связь с лидом, документы заявки, позиции заказа с НДС и маржой (колонки «Заказчик» и «Перевозчик») |
| Перевозчик в заявке | обычные текстовые поля (компания, ИНН с проверкой контрольной суммы, контакт) — отдельного справочника нет |
| Теги | общий свободный справочник лидов: любой сотрудник создаёт, красит в любой HEX, переименовывает. У заявок поле убрано с экрана 03.10.2026 |
| Админка | пользователи (при удалении лиды переходят администратору; последнего администратора снять нельзя), бэкапы, попытки входа |
| Доски сотрудников | администратор набирает фамилию в поиске и открывает воронку любого сотрудника |
| Большие списки | показываются первые 200 записей (клиенты — 500) и честная плашка «Показаны первые N из M» |
| Бухгалтерия | заготовка раздела под будущий функционал |

История по этапам — в разделе 12 [`docs/PROJECT.md`](docs/PROJECT.md).

## Структура репозитория

```
AGENTS.md                   короткие правила для нового участника
docs/SNAPSHOT.md            ← паспорт проекта: собирается из кода скриптом
docs/PROJECT.md             ← полный контекст проекта
docs/deploy/                инструкции: сервер с нуля и деплой
deploy.sh                   деплой одной командой (с автооткатом)
scripts/snapshot.py         сборка паспорта проекта (docs/SNAPSHOT.md)
docker-compose.yml          весь стек: postgres · valkey · backend · worker · beat · frontend · nginx

backend/                    FastAPI
├── app/core/               конфиг, безопасность, логи, кеш, лимитер, ошибки, пагинация
├── app/models/             users, stages, tags, leads, loss reasons, timeline, attachments, shipments, security
├── app/api/v1/             HTTP-слой: auth · launcher · stages · tags · loss_reasons · leads · customers · attachments · shipments · users · admin · health
├── app/services/           бизнес-логика отдельно от HTTP: leads · shipments · attachments · customers · stages · tags · search
├── app/worker/             Celery: бэкапы базы и вложений, уборка файлов и отозванных токенов
├── app/cli.py              createsuperuser, seed, resetboard (сброс доски к стандартной)
├── alembic/                26 миграций
└── tests/                  pytest; локально 191 прошло, 5 пропущено на SQLite

frontend/                   React 19
├── src/app/                router, providers, layout (AppShell, Navbar, ControlPanel)
├── src/features/           auth · launcher · crm (board, list, lead-form) · shipments · customers · accounting · admin
├── src/shared/             api (клиент, сессия, хуки, QueryClient), ui, lib, types
└── src/test/               окружение Vitest и поддельный сервер; 103 frontend-теста

deploy/                     инфраструктура сервера
├── nginx/conf.d/           боевые конфиги сайта
├── nginx/snippets/         TLS-параметры и заголовки безопасности
├── nginx/bootstrap/        временный HTTP-конфиг для первого выпуска сертификата
├── systemd/crm.service     автозапуск стека после перезагрузки
├── restore-test.sh         восстановление бэкапа во временную базу и отчёт о дублях заявок
└── scripts/                deploy-hook Certbot (мягкая перезагрузка nginx)

.github/workflows/          автопроверки: ruff, mypy, pytest, миграции и alembic check,
                            блокирующий аудит зависимостей, те же тесты на настоящем
                            PostgreSQL, tsc, vitest, сборка, `nginx -t` на боевых
                            конфигах; dependabot.yml — еженедельные обновления
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
cd backend && .venv/bin/ruff check . && .venv/bin/ruff format --check . \
  && .venv/bin/mypy app && .venv/bin/python -m pytest && .venv/bin/alembic check
cd ../frontend && npm run lint && npm run format:check && npx tsc -b && npm test \
  && npm run build
cd .. && python scripts/snapshot.py        # пересобрать паспорт проекта
```

То же самое GitHub Actions прогоняет автоматически при каждой отправке —
включая шаг «Паспорт проекта не протух»: после правок в коде
`docs/SNAPSHOT.md` нужно пересобрать и закоммитить.

## Запуск всего стека в Docker

```bash
cp .env.example .env     # заполнить SECRET_KEY и POSTGRES_PASSWORD
docker compose up -d postgres valkey
docker compose build
docker compose run --rm backend alembic upgrade head
docker compose up -d
docker compose exec backend python -m app.cli createsuperuser --email you@example.com --password ...
```

Обычный старт backend намеренно не запускает миграции. На production всегда
используйте `deploy.sh`: он делает дамп и применяет схему отдельным шагом.

## Обновление продакшена

```bash
ssh crm /opt/crm/deploy.sh      # со своего компьютера
cd /opt/crm && ./deploy.sh      # или на сервере
```

`deploy.sh` обновляет код, проверяет свободное место, создаёт и проверяет свежий
дамп, собирает образы, отдельно применяет миграции и проверяет сайт снаружи.
Автооткат старых образов выполняется только при совместимой схеме; после новой
миграции скрипт безопасно откажется запускать старый backend.
Флаги: `--status`, `--no-build`, `--skip-pull`, `--rollback`, `--help`.

## Продакшен

- Домен: https://crmdetroid.ru (редиректы с `www` и с `http`)
- Сервер: vps.sweb.ru, `77.222.38.191`, Ubuntu 26.04 LTS
- Каталог приложения: `/opt/crm` (клон этого репозитория)
- Автозапуск: `systemctl status crm.service`
- Бэкапы: `pg_dump` ежедневно в 03:00, хранение 14 дней; архив вложений — еженедельно
- Проверка бэкапа: `ssh crm "cd /opt/crm && ./deploy/restore-test.sh"` — разворачивает
  свежую копию во временную базу, показывает повторы номеров заявок в ней и
  удаляет её за собой. 07.10.2026 восстановление прошло; в 11 заявках дублей не найдено.
- Доступ по SSH: только по ключам, пользователь `deploy`; как добавить новый
  компьютер — в [`docs/deploy/01-server-setup.md`](docs/deploy/01-server-setup.md)
