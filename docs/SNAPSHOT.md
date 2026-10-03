# Паспорт проекта (собирается автоматически)

> **Этот файл не редактируют руками.** Его собирает `scripts/snapshot.py`
> прямо из кода, а GitHub Actions проверяет, что он не протух.
> Пересобрать: `python scripts/snapshot.py`
>
> Здесь только то, что машина может прочитать в репозитории: состав кода,
> маршруты, таблицы, задачи, тесты, проверки. Изменчивое — версия на проде,
> последние коммиты, дата — намеренно НЕ включено: это агент узнаёт
> командами `git`. Смысл решений и договорённости — в `PROJECT.md`,
> `STATUS.md` и `HANDOVER.md`.

## Из чего состоит система

Контейнеры стека (7): `postgres` · `valkey` · `backend` · `worker` · `beat` · `frontend` · `nginx`.

## Бэкенд: HTTP-слой (`backend/app/api/v1/`)

Роутеры принимают запрос и вызывают сервис — бизнес-логики здесь нет.

| Файл | Адреса начинаются с | Ручек |
|---|---|---|
| `admin.py` | `/admin` | 7 |
| `attachments.py` | `/crm` | 6 |
| `auth.py` | `/auth` | 4 |
| `customers.py` | `/crm/customers` | 2 |
| `health.py` | `—` | 2 |
| `launcher.py` | `/launcher` | 1 |
| `leads.py` | `/crm/leads` | 13 |
| `loss_reasons.py` | `/crm/loss-reasons` | 3 |
| `shipments.py` | `—` | 10 |
| `stages.py` | `/crm/stages` | 5 |
| `tags.py` | `/crm/tags` | 4 |
| `users.py` | `/users` | 1 |

## Бэкенд: слой логики (`backend/app/services/`)

Вся работа с базой, проверки прав, записи в ленту, файлы. Новая логика — сюда.

| Файл | Что внутри |
|---|---|
| `attachments.py` | Бизнес-логика вложений лидов и заявок |
| `customers.py` | Модуль «Клиенты»: все лиды компании одним списком, с маскировкой чужих |
| `leads.py` | Бизнес-логика лидов: доступ, фильтры, карточка, лента, передача продавцу |
| `search.py` | Подготовка строки поиска для SQL-оператора LIKE/ILIKE |
| `shipments.py` | Бизнес-логика заявок на перевозку: доступ, список, статусы, лента |
| `stages.py` | Бизнес-логика этапов канбана (личные доски сотрудников) |
| `tags.py` | Общая логика тегов: используется лидами и заявками |

## Данные

| Модель | Таблица |
|---|---|
| `Attachment` | `attachments` |
| `Lead` | `leads` |
| `LoginAttempt` | `login_attempts` |
| `LossReason` | `loss_reasons` |
| `RevokedToken` | `revoked_tokens` |
| `Shipment` | `shipments` |
| `Stage` | `stages` |
| `Tag` | `tags` |
| `TimelineEntry` | `timeline_entries` |
| `User` | `users` |

Миграций: **22**, последняя в цепочке — `c1d2e3f4a5b6 — Причина отзыва обновляющего токена`.

## Фоновые задачи (Celery beat)

| Задача | Расписание |
|---|---|
| `backup_database` | `crontab(hour=3, minute=0)` |
| `backup_attachments` | `crontab(hour=4, minute=0, day_of_week="sun")` |
| `cleanup_orphan_attachments` | `crontab(hour=4, minute=30, day_of_week="sun")` |
| `cleanup_revoked_tokens` | `crontab(hour=4, minute=45, day_of_week="sun")` |
| `cleanup_login_attempts` | `crontab(hour=5, minute=0, day_of_week="sun")` |
| `cleanup_orphan_files` | `crontab(hour=5, minute=15, day_of_week="sun")` |

## Интерфейс (`frontend/src/features/`)

| Раздел | Страницы |
|---|---|
| `accounting` | `AccountingPage` |
| `admin` | `SecurityPage`, `UsersPage` |
| `auth` | `LoginPage` |
| `crm` | `KanbanPage`, `LeadFormPage` |
| `customers` | `CustomersPage` |
| `launcher` | `LauncherPage` |
| `shipments` | `ShipmentFormPage`, `ShipmentsPage` |

## Тесты

- бэкенд (pytest): **148** тест-функций
- фронтенд (vitest): **68** тестов
- сценарные (подменяется только сеть, остальное настоящее):
  - `frontend/src/features/auth/login-flow.test.tsx`
  - `frontend/src/features/crm/kanban-flow.test.tsx`
  - `frontend/src/features/shipments/shipments-flow.test.tsx`

Считаются объявления в коде; при параметризации фактических прогонов больше.

## Что проверяет CI при каждой отправке

**Бэкенд — ruff, mypy, pytest**

- Установка зависимостей
- Стиль и формат
- Типы
- Тесты
- Миграции проходят на пустой базе
- Модели и миграции совпадают
- Паспорт проекта не протух
- Аудит зависимостей на уязвимости

**Бэкенд на PostgreSQL — миграции и тесты**

- Установка зависимостей
- Миграции на настоящем PostgreSQL
- Модели и миграции совпадают (PostgreSQL)
- Тесты на PostgreSQL
- Причина падения PostgreSQL-тестов

**Фронтенд — типы, тесты, сборка**

- Установка зависимостей
- Линтер
- Формат
- Типы
- Тесты
- Сборка
- Аудит зависимостей на уязвимости

**Nginx — проверка конфигурации**

- Самоподписанные сертификаты (настоящие лежат только на сервере)
- nginx -t на боевых конфигах

**Docker — сборка образов и docker compose config**

- docker compose config проверяет весь стек разом
- Сборка backend-образа
- Сборка frontend-образа

---

Пересобрать этот файл после правок: `python scripts/snapshot.py`
