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
| `carriers.py` | `/carriers` | 3 |
| `health.py` | `—` | 2 |
| `launcher.py` | `/launcher` | 1 |
| `leads.py` | `/crm/leads` | 12 |
| `shipments.py` | `—` | 10 |
| `stages.py` | `/crm/stages` | 5 |
| `tags.py` | `/crm/tags` | 3 |
| `users.py` | `/users` | 1 |

## Бэкенд: слой логики (`backend/app/services/`)

Вся работа с базой, проверки прав, записи в ленту, файлы. Новая логика — сюда.

| Файл | Что внутри |
|---|---|
| `attachments.py` | Бизнес-логика вложений лидов и заявок |
| `leads.py` | Бизнес-логика лидов: доступ, фильтры, карточка, лента, передача продавцу |
| `shipments.py` | Бизнес-логика заявок на перевозку: доступ, список, статусы, лента |

## Данные

| Модель | Таблица |
|---|---|
| `Attachment` | `attachments` |
| `Carrier` | `carriers` |
| `Lead` | `leads` |
| `LoginAttempt` | `login_attempts` |
| `RevokedToken` | `revoked_tokens` |
| `Shipment` | `shipments` |
| `Stage` | `stages` |
| `Tag` | `tags` |
| `TimelineEntry` | `timeline_entries` |
| `User` | `users` |

Миграций: **15**, последняя в цепочке — `f6a7b8c9d0e1 — Убрать старые одиночные поля города у заявки`.

## Фоновые задачи (Celery beat)

| Задача | Расписание |
|---|---|
| `backup_database` | `crontab(hour=3, minute=0)` |
| `backup_attachments` | `crontab(hour=4, minute=0, day_of_week="sun")` |
| `cleanup_orphan_attachments` | `crontab(hour=4, minute=30, day_of_week="sun")` |
| `cleanup_revoked_tokens` | `crontab(hour=4, minute=45, day_of_week="sun")` |

## Интерфейс (`frontend/src/features/`)

| Раздел | Страницы |
|---|---|
| `admin` | `CarriersPage`, `SecurityPage`, `UsersPage` |
| `auth` | `LoginPage` |
| `crm` | `KanbanPage`, `LeadFormPage` |
| `launcher` | `LauncherPage` |
| `shipments` | `ShipmentFormPage`, `ShipmentsPage` |

## Тесты

- бэкенд (pytest): **78** тест-функций
- фронтенд (vitest): **36** тестов
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

**Фронтенд — типы, тесты, сборка**

- Установка зависимостей
- Линтер
- Формат
- Типы
- Тесты
- Сборка

---

Пересобрать этот файл после правок: `python scripts/snapshot.py`
