#!/usr/bin/env bash
# Этот файл передаётся по SSH с компьютера владельца. Он готовит временные
# данные восстановления в /tmp и обязательно запускает обратно пишущие сервисы.
set -Eeuo pipefail
umask 077

PROJECT_DIR="${CRM_PROJECT_DIR:-/opt/crm}"
STAGE_ROOT="${CRM_RECOVERY_STAGE_ROOT:-/tmp}"
STAGE_DIR=""
STAGING_READY=0
KEEP_STAGE_FOR_RECOVERY=0
SERVICES_STOPPED=0
declare -a SERVICES_TO_RESTART=()

log() { printf '[crm-recovery] %s\n' "$*" >&2; }
fail() { log "ОСТАНОВКА: $*"; exit 1; }

service_was_running() {
    local service="$1" container_id state
    container_id="$(docker compose ps --all --quiet "$service" | head -n 1)"
    [[ -n "$container_id" ]] || return 1
    state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
    [[ "$state" == "running" ]]
}

resume_services() {
    if [[ "$SERVICES_STOPPED" -ne 1 ]]; then
        return 0
    fi

    if ((${#SERVICES_TO_RESTART[@]})); then
        log "Запускаю обратно сервисы, которые работали до снимка: ${SERVICES_TO_RESTART[*]}"
        if ! docker compose start "${SERVICES_TO_RESTART[@]}" >&2; then
            return 1
        fi
    fi
    SERVICES_STOPPED=0
}

on_exit() {
    local result=$?
    trap - EXIT

    if ! resume_services; then
        log "ОШИБКА: автоматический запуск сервисов не удался. Проверьте: cd /opt/crm && docker compose ps"
        KEEP_STAGE_FOR_RECOVERY=1
        result=1
    fi

    if [[ -n "$STAGE_DIR" && "$STAGING_READY" -ne 1 && "$KEEP_STAGE_FOR_RECOVERY" -ne 1 ]]; then
        rm -rf -- "$STAGE_DIR"
    elif [[ -n "$STAGE_DIR" && "$KEEP_STAGE_FOR_RECOVERY" -eq 1 ]]; then
        log "Оставляю временные файлы для проверки владельцем: $STAGE_DIR"
    fi
    exit "$result"
}
trap on_exit EXIT

for command_name in docker git df awk tar sha256sum grep sed date hostname mktemp cp chmod flock; do
    command -v "$command_name" >/dev/null 2>&1 || fail "На сервере не найдена команда: $command_name"
done

cd "$PROJECT_DIR" || fail "Каталог $PROJECT_DIR не найден"
[[ -f docker-compose.yml ]] || fail "Запускайте из клона CRM в $PROJECT_DIR"
[[ -d .git && -r .env ]] || fail "Не найден Git-клон или читаемый .env"

# Используем тот же lock, что и deploy.sh: одновременно снимок и выкладка
# могли бы по-разному останавливать и запускать одни и те же контейнеры.
exec 8>/tmp/crm-deploy.lock
flock -n 8 || fail "Сейчас идёт production-деплой; повторите экспорт позже"

if [[ -n "$(git status --porcelain)" ]]; then
    fail "Рабочая копия /opt/crm содержит незакоммиченные файлы. Сначала проверьте их вручную; скрипт ничего не перезаписывает"
fi

# Копия .env должна содержать реальные секреты, а не значения-примеры.
grep -Eq '^SECRET_KEY=.{32,}$' .env || fail "SECRET_KEY пустой или слишком короткий в /opt/crm/.env"
grep -Eq '^POSTGRES_PASSWORD=.+$' .env || fail "POSTGRES_PASSWORD не задан в /opt/crm/.env"

postgres_id="$(docker compose ps --quiet postgres)"
[[ -n "$postgres_id" ]] || fail "Контейнер PostgreSQL не запущен"
postgres_state="$(docker inspect --format '{{.State.Status}}' "$postgres_id")"
postgres_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$postgres_id")"
[[ "$postgres_state" == "running" && "$postgres_health" == "healthy" ]] \
    || fail "PostgreSQL не healthy (state=$postgres_state, health=$postgres_health)"

for service in backend worker beat; do
    if service_was_running "$service"; then
        SERVICES_TO_RESTART+=("$service")
    fi
done

# Перед остановкой приложения проверяем, что для временных файлов хватит места.
[[ -d "$STAGE_ROOT" && -w "$STAGE_ROOT" ]] || fail "Каталог временных файлов недоступен: $STAGE_ROOT"
db_bytes="$(docker compose exec -T postgres sh -ceu 'psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "SELECT pg_database_size(current_database())"')"
attachments_bytes="$(docker compose run --rm --no-deps -T worker python -c 'import os; p="/var/lib/crm/attachments"; print(sum(os.path.getsize(os.path.join(root, name)) for root, _, names in os.walk(p) for name in names))' | tail -n 1 | tr -d '\r')"
[[ "$db_bytes" =~ ^[0-9]+$ ]] || fail "Не удалось оценить размер базы"
[[ "$attachments_bytes" =~ ^[0-9]+$ ]] || fail "Не удалось оценить размер вложений"

available_kb="$(df --output=avail -k "$STAGE_ROOT" | tail -n 1 | tr -d ' ')"
[[ "$available_kb" =~ ^[0-9]+$ ]] || fail "Не удалось проверить свободное место в /tmp"
required_kb=$(((db_bytes + attachments_bytes + 1023) / 1024 + 512 * 1024))
((available_kb >= required_kb)) \
    || fail "В /tmp мало места: свободно ${available_kb} КБ, для снимка нужно примерно ${required_kb} КБ. Сервисы ещё не останавливались"

STAGE_DIR="$(mktemp -d "${STAGE_ROOT%/}/crm-recovery-XXXXXXXXXX")"
chmod 700 "$STAGE_DIR"

log "Сохраняю исходный код точного production-коммита и .env в закрытый временный каталог"
git archive --format=tar.gz --output="$STAGE_DIR/source.tar.gz" HEAD
cp -- .env "$STAGE_DIR/.env"
chmod 600 "$STAGE_DIR/.env"

# Celery Beat останавливаем первым, чтобы он не ставил новые задачи; затем
# дожидаемся остановки worker и API. PostgreSQL и вложения в это время не меняются.
SERVICES_STOPPED=1
for service in beat worker backend; do
    for running_service in "${SERVICES_TO_RESTART[@]}"; do
        if [[ "$service" == "$running_service" ]]; then
            log "Короткое окно обслуживания: останавливаю $service"
            docker compose stop --timeout 60 "$service" >&2
            break
        fi
    done
done

record_counts="$(docker compose exec -T postgres sh -ceu '
psql -X -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At -F "|" -c "SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM leads), (SELECT count(*) FROM shipments), (SELECT count(*) FROM attachments)"
')"
[[ "$record_counts" =~ ^[0-9]+\|[0-9]+\|[0-9]+\|[0-9]+$ ]] \
    || fail "Не удалось записать количество основных записей в манифест"

log "Создаю согласованный custom-format дамп PostgreSQL"
docker compose exec -T postgres sh -ceu \
    'pg_dump --format=custom --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
    > "$STAGE_DIR/database.dump"
[[ -s "$STAGE_DIR/database.dump" ]] || fail "Файл дампа пустой"

docker compose exec -T postgres pg_restore --list \
    < "$STAGE_DIR/database.dump" > "$STAGE_DIR/database-contents.txt"
[[ -s "$STAGE_DIR/database-contents.txt" ]] || fail "pg_restore не прочитал содержимое дампа"

log "Архивирую всё дерево вложений, включая миниатюры"
docker compose run --rm --no-deps -i -T worker python - \
    > "$STAGE_DIR/attachments.tar.gz" <<'PY'
import sys
import tarfile
from pathlib import Path

source = Path("/var/lib/crm/attachments")
if not source.is_dir():
    raise SystemExit("Каталог вложений не найден")
with tarfile.open(fileobj=sys.stdout.buffer, mode="w|gz") as archive:
    archive.add(source, arcname="attachments")
PY
[[ -s "$STAGE_DIR/attachments.tar.gz" ]] || fail "Архив вложений пустой"
tar -tzf "$STAGE_DIR/attachments.tar.gz" >/dev/null || fail "Архив вложений повреждён"
tar -tzf "$STAGE_DIR/source.tar.gz" >/dev/null || fail "Архив исходного кода повреждён"

log "Запускаю обратно сервисы и проверяю, что они работают"
resume_services
for service in "${SERVICES_TO_RESTART[@]}"; do
    container_id="$(docker compose ps --quiet "$service")"
    [[ -n "$container_id" ]] || fail "Сервис $service не поднялся после снимка"
    state="$(docker inspect --format '{{.State.Status}}' "$container_id")"
    [[ "$state" == "running" ]] || fail "Сервис $service не работает после снимка (state=$state)"
done

source_branch="$(git branch --show-current)"
source_commit="$(git rev-parse HEAD)"
created_at="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
os_name="$(sed -n 's/^PRETTY_NAME=//p' /etc/os-release | head -n 1 | tr -d '"')"
postgres_version="$(docker compose exec -T postgres postgres --version | tr -d '\r')"
compose_version="$(docker compose version --short | tr -d '\r')"

{
    printf 'format_version=1\n'
    printf 'created_at_utc=%s\n' "$created_at"
    printf 'hostname=%s\n' "$(hostname)"
    printf 'os=%s\n' "$os_name"
    printf 'project_dir=%s\n' "$PROJECT_DIR"
    printf 'source_branch=%s\n' "$source_branch"
    printf 'source_commit=%s\n' "$source_commit"
    printf 'database_dump=database.dump\n'
    printf 'database_dump_format=PostgreSQL custom\n'
    printf 'postgres_version=%s\n' "$postgres_version"
    printf 'compose_version=%s\n' "$compose_version"
    printf 'record_counts_users_leads_shipments_attachments=%s\n' "$record_counts"
    printf 'attachments_archive=attachments.tar.gz\n'
    printf 'source_archive=source.tar.gz\n'
    printf 'environment_file=.env (encrypted in the final bundle)\n'
    printf '\ncompose_images:\n'
    docker compose images | sed 's/^/  /'
} > "$STAGE_DIR/MANIFEST.txt"

(
    cd "$STAGE_DIR"
    sha256sum database.dump attachments.tar.gz source.tar.gz > SHA256SUMS
    sha256sum --check SHA256SUMS >&2
)

STAGING_READY=1
log "Снимок готов; API/worker/beat восстановлены. Передаю временный каталог на компьютер владельца"
printf '%s\n' "$STAGE_DIR"
