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

В production Docker Compose запускает Gunicorn с доверенным адресом nginx в
сети `crm_proxy` (`172.31.250.2` по умолчанию); backend закреплён на отдельном
адресе `172.31.250.3`. Если backend запускается через другой обратный прокси,
безопасно задайте `GUNICORN_FORWARDED_ALLOW_IPS` адресом этого прокси; по
умолчанию удалённые `X-Forwarded-*` заголовки не принимаются.

Без PostgreSQL можно поднять всё на SQLite — удобно для быстрой проверки:

```bash
export DATABASE_URL="sqlite+aiosqlite:///./crm.db"
```

## Проверки

Обновить закреплённые версии (после правки зависимостей в `pyproject.toml`):

```bash
pip install pip-tools
pip-compile --generate-hashes --output-file requirements.lock pyproject.toml
pip-compile --generate-hashes --extra dev --output-file requirements-dev.lock pyproject.toml
```

```bash
.venv/bin/ruff check .        # линтер
.venv/bin/ruff format .       # форматирование
.venv/bin/mypy app            # типы (strict)
.venv/bin/python -m pytest --cov=app --cov-branch --cov-report=term-missing --cov-fail-under=70
# порог тот же, что в CI: не ниже 70% общего покрытия с ветвлениями
.venv/bin/alembic check       # модели, включая значения по умолчанию, совпадают со схемой
.venv/bin/pip-audit           # уязвимости в зависимостях
```

**Границы тестового окружения:** обычный `pytest` открывает отдельную сессию
БД на каждый HTTP-запрос; кеш заменён памятью, ограничитель частоты выключен.
Два теста гонок запускаются только на PostgreSQL. Отдельный набор
`integration_tests` в CI подключается к настоящим PostgreSQL и Valkey,
включает ограничитель и запускает Celery worker: проверяются кеш и его сброс,
ответ 429 при превышении лимита и выполнение фоновой задачи. Эти интеграционные
проверки не запускаются обычной командой `pytest`. Текущие остатки — в
[`docs/STATUS.md`](../docs/STATUS.md).

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
│   ├── db/                Base, async engine, сессия-зависимость, advisory-блокировки PostgreSQL
│   ├── models/            User · Stage · Tag · Lead · LossReason · Shipment · TimelineEntry ·
│   │                      Attachment · LoginAttempt · RevokedToken
│   ├── schemas/           Pydantic v2: запросы и ответы
│   ├── api/
│   │   ├── deps.py        сессия, текущий пользователь, проверка ролей
│   │   └── v1/            ТОЛЬКО HTTP: маршруты, параметры, коды ответов
│   │                      auth · launcher · stages · tags · loss_reasons · leads ·
│   │                      customers · attachments · shipments · users · admin · health
│   ├── services/          бизнес-логика, отделённая от HTTP: leads · shipments ·
│   │                      attachments · customers · stages · tags · search
│   └── worker/            Celery: приложение и задачи (бэкапы, уборка)
├── alembic/               миграции: 26 шт., первая создаёт всю схему
├── tests/                 pytest + httpx ASGITransport
├── requirements.lock      версии для production-образа (с хешами)
├── requirements-dev.lock  те же плюс инструменты разработки (для CI)
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
| POST | `/api/v1/crm/stages/reorder` | новый порядок этапов целиком, одной транзакцией |
| GET/POST/PATCH/DELETE | `/api/v1/crm/tags` | все авторизованные (теги — рабочий инструмент, не настройка) |
| GET | `/api/v1/crm/loss-reasons` | авторизованные; создание и удаление — admin |
| GET/POST | `/api/v1/crm/leads` | свои лиды; админ видит все |
| GET | `/api/v1/crm/leads/{id}` | свой лид или любой проигранный (прочитать можно всем) |
| PATCH | `/api/v1/crm/leads/{id}` | свой активный; проигранный — только после восстановления; чужой активный — 404; нужен `expected_updated_at`, устаревшая версия — 409 `lead_conflict` |
| DELETE | `/api/v1/crm/leads/{id}` | свой лид (архивация) |
| DELETE | `/api/v1/crm/leads/{id}/permanent` | admin: стирает лид, заявки, историю и файлы безвозвратно |
| POST | `/api/v1/crm/leads/{id}/lose` · `/restore` | проигрыш с причиной и возврат в работу |
| GET | `/api/v1/crm/leads/{id}/timeline` | авторизованные |
| POST | `/api/v1/crm/leads/{id}/notes` | авторизованные |
| PATCH/DELETE | `/api/v1/crm/leads/{id}/timeline/{entry_id}` | только свои примечания; системные записи неизменяемы |
| GET | `/api/v1/crm/leads/{id}/pager` | считает только видимые лиды одной доски |
| POST | `/api/v1/crm/leads/{id}/transfer` | передать лид коллеге (свой лид) |
| GET | `/api/v1/crm/customers` | все лиды компании; чужой активный — только название, ИНН и продавец |
| GET | `/api/v1/crm/customers/by-inn` | предупреждение о дубле ИНН (`?inn=`, `?exclude_id=`) |
| GET | `/api/v1/users/colleagues` | список активных сотрудников (имя и фамилия) |
| GET/POST | `/api/v1/crm/leads/{id}/attachments` | авторизованные (до 25 МБ) |
| GET/DELETE | `/api/v1/crm/attachments/{id}` | по доступу к лиду; удалить — автор или админ |
| GET/POST | `/api/v1/shipments/{id}/attachments` | документы заявки |
| GET/POST | `/api/v1/shipments` | авторизованные; `?search=` по номеру, клиенту и перевозчику |
| GET/PATCH | `/api/v1/shipments/{id}` | авторизованные; поле `status` через общий PATCH не меняется |
| PATCH | `/api/v1/shipments/{id}/status` | единственный способ сменить статус — пишет запись в историю |
| GET | `/api/v1/shipments/{id}/timeline` · POST `/notes` | лента и примечания заявки |
| PATCH/DELETE | `/api/v1/shipments/{id}/timeline/{entry_id}` | только свои примечания |
| GET | `/api/v1/leads/{id}/shipments` | заявки лида (вкладка в карточке) |
| GET | `/api/v1/admin/backups` · POST `/api/v1/admin/backup` | admin |
| GET | `/api/v1/admin/login-attempts` | admin |
| GET/POST/PATCH/DELETE | `/api/v1/admin/users` | admin |
| GET | `/health`, `/health/ready` | без авторизации |

**Номера заявок.** Номер уникален в базе. Если занятый номер отправлен при
создании или изменении заявки, API отвечает 409 `shipment_number_conflict` и
показывает понятное сообщение. Автоматический номер берётся из ID заявки; если
такой текст уже занят, к нему добавляется суффикс. Миграция `a7c9e2d4f681`
перед изменением схемы повторно проверяет базу и останавливается при дублях,
не меняя существующие номера.

**Теги.** `POST` возвращает уже существующий тег, если название совпадает без
учёта регистра. `PATCH` с названием другого тега отвечает 409 `tag_name_conflict`;
параллельное создание и переименование имён сериализуется advisory-блокировкой
PostgreSQL.

**Удаление сотрудника.** Лиды переходят администратору, который удалил учётную
запись. В ленте каждой карточки появляется запись «Продавец: старый → новый»
от имени этого администратора; перенос и удаление проходят одной транзакцией.

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
(30 минут), фронтенд держит его в памяти вкладки. Сервер сериализует запросы
продления с одной кукой PostgreSQL advisory-блокировкой по `jti`: второй запрос
видит свежую ротацию и проходит в пределах 15-секундного окна, не упираясь в
уникальность чёрного списка. Выход использует ту же блокировку и сразу
переводит отметку в состояние `logout`.

**Формат ответов.** Списки отдаются как `{count, next, previous, results}` —
ровно то, что уже умеет читать фронтенд. Ошибки всегда `{detail, code, request_id}`.

**История изменений — доказательство, а не заметки.** Смена этапа лида и
смена статуса заявки автоматически пишут запись в `timeline_entries` — из неё
строится лента чаттера. Системные записи нельзя ни отредактировать, ни
удалить: API разрешает это только для собственных примечаний. Статус заявки
меняется исключительно через `PATCH /shipments/{id}/status`; в общей схеме
`ShipmentUpdate` поля `status` нет, а неизвестные поля PATCH получают 422.

**Перенос заявки к другому лиду целостен.** Сервис проверяет доступ к новому
лиду и одной транзакцией переносит саму заявку, её историю и вложения; на
уровне базы это закреплено составными внешними ключами
(`uq_shipments_id_lead_id`). Иначе файлы оставались бы доступны прежнему
владельцу, а удаление старого лида уносило бы историю новой заявки.

**Валидация ИНН.** Контрольная сумма ФНС проверяется в схеме (10 и 12 цифр),
в базе дополнительно стоит CHECK на длину. Явный `null` в обязательном поле
отвергается с понятным текстом, а не доходит до базы.

**Схемы правки (PATCH) строгие.** Все `*Update` наследуют `PatchModel`
(`app/schemas/common.py`): неизвестное поле — ошибка 422 (опечатка в имени
больше не даёт ложного «сохранено»), явный `null` разрешён только для полей,
которые в базе действительно необязательные (перечислены в `nullable_fields`
каждой схемы).

**Параллельная правка лида.** При каждом PATCH клиент передаёт `expected_updated_at`
из последнего ответа с карточкой. База атомарно сравнивает это значение и меняет
версию; если карточку уже сохранили, запрос получает 409 `lead_conflict` и не
затирает ни одного поля. Форма предлагает загрузить актуальную карточку, канбан
обновляет данные с сервера.

**Поиск.** Шаблон для ILIKE собирает `app/services/search.py`: служебные
символы `%` и `_` экранируются, иначе запрос «50%» вёл бы себя как маска и
возвращал вообще всё.

**Теги.** Неизвестный `tag_id` — ошибка 404, а не молчаливая очистка всех
тегов записи (так было, если тег успел удалить коллега).

**Последний администратор защищён.** Нельзя снять роль, отключить или удалить
учётную запись, если это единственный действующий администратор, — иначе
управление системой оказалось бы недоступно никому. PostgreSQL advisory-блокировка
удерживается от повторной проверки роли до коммита; одновременные запросы не
могут оба посчитать друг друга «оставшимся администратором».

**Длина пароля.** Не больше 72 байт: bcrypt всё равно учитывает только их,
и два разных длинных пароля оказались бы для системы одинаковыми.

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
| `cleanup_revoked_tokens` | воскресенье 04:45 | убирает истёкшие записи из `revoked_tokens` |
| `cleanup_login_attempts` | воскресенье 05:00 | чистит журнал входов старше 90 дней |
| `cleanup_orphan_files` | воскресенье 05:15 | удаляет файлы на диске, которых нет в базе |

## Миграции

```bash
.venv/bin/alembic revision --autogenerate -m "описание"
.venv/bin/alembic upgrade head
.venv/bin/alembic downgrade -1
```

Первая миграция (`initial schema`) создаёт базовую схему, остальные двадцать
пять меняют её по ходу работы. Сейчас в базе десять таблиц: `users`, `stages`,
`tags`, `leads`, `loss_reasons`, `shipments`, `timeline_entries`,
`attachments`, `login_attempts`, `revoked_tokens`.

Контейнер `backend` миграции при старте **не** применяет — схему обновляет
только `deploy.sh` отдельным шагом (см. корневой `README.md`). Это сделано,
чтобы случайный перезапуск контейнера не накатил миграцию вне окна деплоя.
