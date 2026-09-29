#!/usr/bin/env bash
# =============================================================================
#  Учебное восстановление из бэкапа.
#
#  Запуск на сервере:  cd /opt/crm && ./deploy/restore-test.sh
#  С компьютера:       ssh crm "cd /opt/crm && ./deploy/restore-test.sh"
#
#  Что делает: берёт свежую ночную копию, разворачивает её в ОТДЕЛЬНУЮ
#  временную базу, пересчитывает записи и удаляет временную базу за собой.
#  Рабочая база при этом не меняется — её никто не трогает и не перезаписывает.
#
#  Зачем: копия, которую ни разу не восстанавливали, — это ещё не копия.
#  Скрипт отвечает на вопрос «сможем ли мы подняться, если сервер умрёт».
# =============================================================================

set -euo pipefail

TEST_DB="crm_restore_test"
BACKUP_DIR="/var/backups/crm"

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null || fail "Docker не найден — запускать нужно на сервере"
[ -f docker-compose.yml ] || fail "Запускать из каталога /opt/crm"

# --- 1. Выбираем копию -------------------------------------------------------
say "1. Ищем свежую копию базы"
DUMP="${1:-}"
if [ -z "$DUMP" ]; then
    DUMP=$(docker compose exec -T worker sh -c "ls -1t $BACKUP_DIR/crm-*.dump 2>/dev/null | head -1" || true)
    DUMP=$(printf '%s' "$DUMP" | tr -d '\r')
fi
[ -n "$DUMP" ] || fail "Копий не найдено в $BACKUP_DIR — ночная задача ещё не отработала?"

docker compose exec -T worker ls -lh "$DUMP"

# --- 2. Готовим временную базу ----------------------------------------------
say "2. Создаём временную базу $TEST_DB"
docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS $TEST_DB'" >/dev/null
docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d postgres -c 'CREATE DATABASE $TEST_DB'" >/dev/null

# Временную базу убираем в любом случае: и при успехе, и при ошибке.
cleanup() {
    say "Убираем временную базу"
    docker compose exec -T postgres sh -c \
        "psql -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS $TEST_DB'" >/dev/null || true
}
trap cleanup EXIT

# --- 3. Восстанавливаем ------------------------------------------------------
say "3. Разворачиваем копию во временную базу"
docker compose exec -T worker sh -c \
    "pg_restore --no-owner --no-privileges --exit-on-error \
        --dbname \"postgresql://\$POSTGRES_USER:\$POSTGRES_PASSWORD@postgres:5432/$TEST_DB\" \
        '$DUMP'" \
    || fail "Восстановление не удалось — копия непригодна, разбираться нужно сейчас"

# --- 4. Сверяем содержимое ---------------------------------------------------
say "4. Сравниваем рабочую базу и восстановленную"
QUERY="SELECT
    (SELECT count(*) FROM users)     AS \"сотрудники\",
    (SELECT count(*) FROM stages)    AS \"этапы\",
    (SELECT count(*) FROM leads)     AS \"лиды\",
    (SELECT count(*) FROM shipments) AS \"заявки\",
    (SELECT count(*) FROM attachments) AS \"вложения\";"

echo "— рабочая база:"
docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" -c \"$QUERY\""

echo "— восстановленная копия:"
docker compose exec -T postgres sh -c \
    "psql -U \"\$POSTGRES_USER\" -d $TEST_DB -c \"$QUERY\""

say "Готово. Копия разворачивается, данные на месте."
echo "Числа могут отличаться на записи, добавленные после ночного бэкапа, — это нормально."
