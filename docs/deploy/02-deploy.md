# Этап 4. Деплой полного стека на crmdetroid.ru

Что поднимаем: **PostgreSQL 18 + Valkey 8 + FastAPI (Gunicorn) + Celery worker + Celery beat + собранный React + Nginx 1.27**.
Наружу по-прежнему смотрит только nginx на портах 80/443 — всё остальное живёт внутри docker-сетей.

```
                 ┌──────────── интернет ────────────┐
                 ▼                                  │
        crm-nginx :80/:443  ──── /api/ ────►  crm-backend :8000 ──┐
          (сеть edge)       ──── /     ────►  crm-frontend :80    │
                                                                  │  сеть internal
                                   crm-worker ──┐                 │
                                   crm-beat   ──┼──► crm-valkey :6379
                                                └──► crm-postgres :5432
```

> Все команды выполняются на сервере под пользователем `deploy`
> (`ssh crm`). Перед блоками вставки лучше разблокировать sudo: `sudo -v`.

---

## Шаг 1. Смотрим, что есть на сервере

```bash
df -h /
```

```bash
free -h
```

Для сборки нужно **минимум 4 ГБ свободного места** на диске. Если меньше — сначала
почистите Docker: `docker system prune -af`.

---

## Шаг 2. Превращаем /opt/crm в клон репозитория

Сейчас в `/opt/crm` лежат файлы, созданные руками на этапе 1. Теперь весь проект
(код бэкенда, фронтенда, конфиги nginx, docker-compose) приезжает из Git — так
обновления будут делаться одной командой `git pull`.

Сохраняем старый каталог на всякий случай:

```bash
sudo mv /opt/crm /opt/crm.stage1
```

Клонируем репозиторий:

```bash
sudo mkdir -p /opt/crm && sudo chown deploy:deploy /opt/crm
```

```bash
git clone -b arena/01a0eb16-crm https://github.com/Roses1s/crm.git /opt/crm
```

Возвращаем каталог, через который Let's Encrypt проверяет домен:

```bash
mkdir -p /opt/crm/certbot/www
```

```bash
ls /opt/crm
```

**Ожидаем:** `backend  deploy  docker-compose.yml  docs  frontend  README.md  certbot`

> Сертификаты никуда не делись: они лежат в `/etc/letsencrypt` на самом сервере,
> а не в `/opt/crm`.

---

## Шаг 3. Заполняем файл секретов `.env`

```bash
cd /opt/crm && cp .env.example .env
```

Генерируем два случайных значения:

```bash
echo "SECRET_KEY=$(openssl rand -hex 32)"
```

```bash
echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
```

Открываем файл и подставляем их вместо `ЗАМЕНИТЕ_МЕНЯ`:

```bash
nano /opt/crm/.env
```

*(сохранить `Ctrl+O` → `Enter`, выйти `Ctrl+X`)*

Проверяем, что заглушек не осталось:

```bash
grep -c "ЗАМЕНИТЕ_МЕНЯ" /opt/crm/.env
```

**Ожидаем:** `0`

```bash
chmod 600 /opt/crm/.env
```

*Зачем `chmod`: в файле пароль базы и ключ подписи токенов — читать его должен только владелец.*

---

## Шаг 4. Останавливаем старый nginx-контейнер

Он поднят из конфигурации этапа 1 и занимает порты 80/443.

```bash
cd /opt/crm.stage1 && docker compose down
```

```bash
docker ps
```

**Ожидаем:** пустой список.

---

## Шаг 5. Собираем и запускаем стек

```bash
cd /opt/crm && docker compose build
```

Первая сборка идёт **5–15 минут**: качаются образы Python, Node, Postgres, Valkey
и ставятся зависимости. Дальше всё кешируется и пересборка занимает секунды.

```bash
docker compose up -d
```

```bash
docker compose ps
```

**Ожидаем** шесть контейнеров в состоянии `Up` (`postgres` и `valkey` — ещё и `healthy`):

```
crm-postgres   Up (healthy)
crm-valkey     Up (healthy)
crm-backend    Up
crm-worker     Up
crm-beat       Up
crm-frontend   Up
crm-nginx      Up (healthy)
```

Смотрим, что миграции прошли:

```bash
docker compose logs backend | head -30
```

**Ожидаем** строки `Running upgrade -> ... initial schema` и `Application startup complete`.

---

## Шаг 6. Создаём администратора

```bash
docker compose exec backend python -m app.cli createsuperuser --email ВАШ@EMAIL.RU --password ВашНадёжныйПароль
```

**Ожидаем:** `Создан администратор ...`

Если хотите сразу увидеть заполненный интерфейс — загрузите демо-данные
(этапы, теги, несколько лидов и заявку):

```bash
docker compose exec backend python -m app.cli seed
```

---

## Шаг 7. Проверяем изнутри сервера

```bash
curl -s -o /dev/null -w "nginx: %{http_code}\n" https://crmdetroid.ru
```

```bash
curl -s https://crmdetroid.ru/health
```

```bash
curl -s -X POST https://crmdetroid.ru/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"ВАШ@EMAIL.RU","password":"ВашНадёжныйПароль"}' | head -c 120; echo
```

**Ожидаем:** `nginx: 200`, ответ `{"status":"ok",...}` и JSON с `access_token`.

---

## Шаг 8. Проверяем в браузере

Открываем **https://crmdetroid.ru** — должна открыться страница входа.
Входим под созданным администратором:

1. **Приложения** — три плитки (CRM, Заявки, Администрирование)
2. **CRM** — канбан с колонками этапов и карточками лидов
3. **Карточка лида** — форма, вкладка «Заявки», справа лента; напишите примечание
   и нажмите «Записать» — запись появится в ленте (это уже настоящая запись в базе)
4. **Смена этапа** — кликните другой этап в статусбаре: изменение сохранится
   и попадёт в ленту отдельной строкой
5. **Администрирование → Дашборд** — цифры и график воронки из базы

---

## Шаг 9. Фоновые задачи

```bash
docker compose logs beat | tail -5
```

**Ожидаем:** `beat: Starting...` и расписание из трёх задач.

Проверим задачу резервного копирования прямо сейчас, не дожидаясь трёх ночи:

```bash
docker compose exec worker python -c "from app.worker.tasks import backup_database; print(backup_database())"
```

**Ожидаем:** `{'ok': True, 'file': 'crm-....dump', 'size': ...}`

```bash
docker compose exec worker ls -lh /var/backups/crm
```

---

## Шаг 10. Автозапуск после перезагрузки

Служба `crm.service` настроена на этапе 1 и указывает на `/opt/crm` — она подхватит
новый compose-файл автоматически. Проверяем:

```bash
systemctl is-enabled crm.service
```

```bash
sudo systemctl restart crm.service && sleep 20 && docker compose ps
```

И контрольная перезагрузка сервера:

```bash
sudo reboot
```

Через ~90 секунд (стеку нужно больше времени, чем одному nginx):

```bash
ssh crm
```

```bash
cd /opt/crm && docker compose ps && curl -s -o /dev/null -w "%{http_code}\n" https://crmdetroid.ru
```

**Ожидаем:** все контейнеры подняты сами, сайт отвечает `200`.

---

## Обновление приложения в будущем

```bash
cd /opt/crm
git pull
docker compose build
docker compose up -d
docker compose logs -f backend   # убедиться, что миграции прошли
```

Миграции накатываются автоматически при старте контейнера `backend`.
Откат к предыдущей версии: `git checkout <коммит> && docker compose up -d --build`.

---

## Чек-лист этапа 4

| # | Проверка | Команда | Ожидаемый результат |
|---|---|---|---|
| 1 | Контейнеры | `docker compose ps` | 7 сервисов Up |
| 2 | Миграции | `docker compose exec backend alembic current` | номер ревизии (head) |
| 3 | База закрыта снаружи | `nc -z -w2 77.222.38.191 5432; echo $?` | не `0` (порт закрыт) |
| 4 | Сайт | `curl -I https://crmdetroid.ru` | HTTP/2 200 |
| 5 | API | `curl -s https://crmdetroid.ru/health` | `{"status":"ok"...}` |
| 6 | Документация закрыта | `curl -s -o /dev/null -w "%{http_code}" https://crmdetroid.ru/docs` | 404 |
| 7 | Воркер | `docker compose logs worker \| grep ready` | `celery@... ready` |
| 8 | Бэкап | вызов `backup_database` | `{'ok': True, ...}` |
| 9 | Сертификат | `sudo certbot certificates` | VALID, ~80+ дней |
| 10 | После ребута | `docker compose ps` | всё поднялось само |

---

## Частые проблемы

**Сборка падает с `killed` на этапе `npm run build`.**
Не хватило памяти. Временно увеличьте swap до 4 ГБ:
```bash
sudo swapoff /swapfile && sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
```

**`nginx: [emerg] host not found in upstream "backend"`.**
Nginx стартовал раньше, чем бэкенд. Достаточно `docker compose up -d nginx`
или `docker compose restart nginx` после того, как бэкенд поднялся.

**`dependency failed to start: container crm-postgres is unhealthy`.**
Смотрите `docker compose logs postgres --tail 30`. Если там текст
`in 18+, these Docker images are configured to store database data ...` — том
смонтирован по старому пути. В compose должно быть `pgdata:/var/lib/postgresql`
(без `/data` на конце): начиная с Postgres 18 данные лежат в
`/var/lib/postgresql/18/docker`, и образ отказывается стартовать со старой схемой.
После правки: `docker compose down -v && docker compose up -d` (том пустой,
терять нечего).

**Воркер или beat перезапускаются по кругу.**
`docker compose logs worker --tail 20`. Если там `ModuleNotFoundError` —
не хватает пакета в образе; после `git pull` нужна пересборка:
`docker compose build backend && docker compose up -d`.

**Бэкенд перезапускается по кругу.**
`docker compose logs backend --tail 50`. Чаще всего: не заполнен `.env`
(`SECRET_KEY`, `POSTGRES_PASSWORD`) или база ещё инициализируется — подождите минуту.

**502 Bad Gateway на сайте.**
Бэкенд или фронтенд не запущены: `docker compose ps`, затем логи упавшего сервиса.

**Логин отвечает 401 при верном пароле.**
Пользователь создан в другой базе (например, до `docker compose down -v`).
Создайте администратора заново командой из шага 6.

**Кончается место на диске.**
```bash
docker system df
docker system prune -af
docker volume ls          # volume pgdata НЕ удалять — в нём база
```

**Нужно посмотреть данные в базе.**
```bash
docker compose exec postgres psql -U crm -d crm -c "\dt"
docker compose exec postgres psql -U crm -d crm -c "select id, name, stage_id from leads limit 5;"
```

---

## Что работает через интерфейс

Вход и выход, лаунчер, канбан (поиск, фильтры по этапу/тегу/приоритету/архиву,
группировка, перетаскивание карточек между этапами, создание, переименование,
цвет и удаление этапов, быстрое создание лида в колонке), список лидов,
карточка лида (сохранение всех полей, теги, приоритет, смена этапа, примечания,
архивация, переход по соседним записям), заявки (создание, правка, смена статуса,
фильтр по статусу), перевозчики, пользователи (создание, правка, удаление),
дашборд, раздел «Безопасность» (список бэкапов, ручной запуск задачи, журнал
неудачных попыток входа).

Вложения в чаттере: загрузка, скачивание, предпросмотр картинок и PDF, удаление.
Файлы лежат в томе `attachments` на сервере, лимит 25 МБ на файл. Занятое место
и остаток на диске видны в разделе «Безопасность».

⚠️ **Бэкап файлов идёт отдельно от базы.** Дамп `pg_dump` содержит только данные,
поэтому по воскресеньям в 04:00 задача `backup_attachments` пакует вложения
в `files-<дата>.tar.gz` (хранятся 4 последних архива, рядом с дампами базы).
Проверить вручную:

```bash
docker compose exec worker python -c "from app.worker.tasks import backup_attachments; print(backup_attachments())"
```
