#!/usr/bin/env bash
# =============================================================================
#  Деплой CRM Detroid одной командой.
#
#      ./deploy.sh                 обновить код и перезапустить стек
#      ./deploy.sh --no-build      перезапустить без пересборки образов
#      ./deploy.sh --skip-pull     собрать то, что уже лежит в каталоге
#      ./deploy.sh --rollback      вернуть предыдущие образы
#      ./deploy.sh --status        показать состояние, ничего не меняя
#      ./deploy.sh --help          подсказка
#
#  Что скрипт делает такого, чего не делает `docker compose up -d`:
#    * не даёт запустить два деплоя одновременно (блокировка);
#    * до миграций проверяет место и создаёт свежий проверяемый дамп базы;
#    * мигрирует схему отдельным шагом, до запуска нового приложения;
#    * откатывает образы только когда схема совместима со старым бэкендом;
#    * ждёт, пока контейнеры станут healthy, и проверяет сайт снаружи;
#    * пишет журнал и подчищает старые образы (диск здесь всего 15 ГБ).
# =============================================================================

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_FILE="/tmp/crm-deploy.lock"
LOG_FILE="${PROJECT_DIR}/.deploy.log"
SITE_URL="${SITE_URL:-https://crmdetroid.ru}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"   # секунд ждать готовности контейнеров
MIN_FREE_MB="${MIN_FREE_MB:-2048}"         # оставить после дампа для сборки/работы
BACKUP_DIR="/var/backups/crm"
BUILT_SERVICES=(backend frontend)
SERVICES=(crm-postgres crm-valkey crm-backend crm-worker crm-beat crm-frontend crm-nginx)

DO_PULL=1
DO_BUILD=1
MODE="deploy"
SCHEMA_CHANGED=0
PRE_DEPLOY_BACKUP=""
# При старой сети нельзя частично пересоздать Compose-сеть до резервной копии:
# другие работающие сервисы ещё держат её endpoints.
NETWORK_TRANSITION_REQUIRED=0

# --- вывод -------------------------------------------------------------------
if [[ -t 1 ]]; then
    C_OK=$'\e[32m'; C_ERR=$'\e[31m'; C_WARN=$'\e[33m'; C_DIM=$'\e[2m'; C_OFF=$'\e[0m'
else
    C_OK=""; C_ERR=""; C_WARN=""; C_DIM=""; C_OFF=""
fi

log()  { printf '%s %s\n' "$(date '+%H:%M:%S')" "$*" | tee -a "$LOG_FILE"; }
ok()   { log "${C_OK}✓${C_OFF} $*"; }
warn() { log "${C_WARN}!${C_OFF} $*"; }
die()  { log "${C_ERR}✗ $*${C_OFF}"; exit 1; }
step() { log ""; log "${C_DIM}── $* ─────────────────────────────${C_OFF}"; }

usage() {
    cat <<'TEXT'
Деплой CRM Detroid одной командой.

  ./deploy.sh                 обновить код, пересобрать образы и перезапустить
  ./deploy.sh --no-build      перезапустить без пересборки
  ./deploy.sh --skip-pull     собрать то, что уже лежит в каталоге
  ./deploy.sh --rollback      вернуть предыдущие образы
  ./deploy.sh --status        показать состояние, ничего не меняя
  ./deploy.sh --help          эта подсказка

Переменные окружения:
  SITE_URL=https://crmdetroid.ru   какой адрес проверять после запуска
  HEALTH_TIMEOUT=180               сколько секунд ждать готовности контейнеров
  MIN_FREE_MB=2048                 сколько места оставить после свежего дампа
TEXT
    exit 0
}

# --- разбор аргументов --------------------------------------------------------
while [[ $# -gt 0 ]]; do
    case "$1" in
        --no-build)  DO_BUILD=0 ;;
        --skip-pull) DO_PULL=0 ;;
        --rollback)  MODE="rollback" ;;
        --status)    MODE="status" ;;
        -h|--help)   usage ;;
        *)           die "Неизвестный аргумент: $1 (см. ./deploy.sh --help)" ;;
    esac
    shift
done

cd "$PROJECT_DIR"

# --- проверки окружения -------------------------------------------------------
require_env() {
    command -v docker >/dev/null || die "docker не найден"
    command -v git >/dev/null || die "git не найден"
    command -v curl >/dev/null || die "curl не найден"
    command -v flock >/dev/null || die "flock не найден"
    docker compose version >/dev/null 2>&1 || die "docker compose не установлен"
    [[ -f docker-compose.yml ]] || die "docker-compose.yml не найден в $PROJECT_DIR"
    [[ -f .env ]] || die ".env отсутствует — скопируйте .env.example и заполните секреты"
    [[ "$MIN_FREE_MB" =~ ^[0-9]+$ && "$MIN_FREE_MB" -ge 512 ]] \
        || die "MIN_FREE_MB должен быть целым числом не меньше 512"
}

container_state() {
    docker inspect -f '{{.State.Status}}' "$1" 2>/dev/null || echo "missing"
}

container_health() {
    docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$1" \
        2>/dev/null || echo "missing"
}

show_status() {
    printf '\n%s\n' "КОНТЕЙНЕР      СОСТОЯНИЕ    ПРОВЕРКА"
    for name in "${SERVICES[@]}"; do
        printf '%-14s %-12s %s\n' "$name" "$(container_state "$name")" "$(container_health "$name")"
    done
    printf '\n'
}

human_kb() {
    awk -v kb="$1" 'BEGIN {printf "%.1f ГБ", kb / 1024 / 1024}'
}

db_query() {
    local sql="$1"
    docker compose exec -T postgres sh -c \
        'psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atqc "$1"' \
        sh "$sql"
}

current_db_revision() {
    local revision
    if ! revision="$(db_query "SELECT version_num FROM alembic_version" 2>/dev/null)"; then
        # На самом первом развёртывании таблицы alembic_version ещё нет.
        printf 'base\n'
        return
    fi
    [[ -n "$revision" ]] && printf '%s\n' "$revision" || printf 'base\n'
}

image_schema_head() {
    local image="$1"
    docker run --rm --network crm_internal --env-file .env \
        -e POSTGRES_HOST=postgres -e VALKEY_URL=redis://valkey:6379/0 \
        "$image" alembic heads 2>/dev/null | awk '/\(head\)/ {print $1}'
}

wait_core_services() {
    local deadline=$((SECONDS + HEALTH_TIMEOUT))
    local postgres_health valkey_health
    while (( SECONDS < deadline )); do
        postgres_health="$(container_health crm-postgres)"
        valkey_health="$(container_health crm-valkey)"
        if [[ "$postgres_health" == "healthy" && "$valkey_health" == "healthy" ]]; then
            return 0
        fi
        sleep 2
    done
    die "PostgreSQL/Valkey не стали healthy за ${HEALTH_TIMEOUT}с"
}

internal_network_needs_transition() {
    local internal_state
    internal_state="$(docker network inspect --format '{{.Internal}}' crm_internal 2>/dev/null || true)"
    [[ "$internal_state" == "false" ]]
}

verify_internal_network() {
    local internal_state
    internal_state="$(docker network inspect --format '{{.Internal}}' crm_internal 2>/dev/null || true)"
    [[ "$internal_state" == "true" ]] \
        || die "Сеть crm_internal не подтверждена как internal: true; миграция не запускалась"
}

prepare_core_services() {
    if internal_network_needs_transition; then
        # Пока сеть старая, частичный `compose up postgres valkey` опасен:
        # Compose остановил бы БД и не смог бы удалить сеть из-под app endpoints.
        if [[ "$(container_state crm-postgres)" != "running" || \
            "$(container_state crm-valkey)" != "running" ]]; then
            die "Сеть crm_internal ещё не изолирована, а PostgreSQL/Valkey не запущены. Стек не меняли; сначала восстановите основные контейнеры и повторите деплой"
        fi
        wait_core_services
        NETWORK_TRANSITION_REQUIRED=1
        ok "PostgreSQL и Valkey работают; смена сети отложена до проверенного дампа"
        return
    fi

    docker compose up -d postgres valkey 2>&1 | tee -a "$LOG_FILE"
    wait_core_services
    verify_internal_network
}

recreate_internal_network_if_needed() {
    [[ "$NETWORK_TRANSITION_REQUIRED" -eq 1 ]] || return 0

    step "Безопасное переключение внутренней сети"
    # Именованные тома сохраняются: нельзя добавлять `-v`, иначе исчезнет база.
    if ! docker compose down --remove-orphans 2>&1 | tee -a "$LOG_FILE"; then
        die "Не удалось остановить стек для переключения crm_internal. База не мигрирована"
    fi
    if ! docker compose up -d postgres valkey 2>&1 | tee -a "$LOG_FILE"; then
        die "Не удалось поднять PostgreSQL/Valkey в новой сети. Миграция не запускалась"
    fi
    wait_core_services
    verify_internal_network
    ok "Внутренняя сеть пересоздана, PostgreSQL и Valkey готовы"
}

preflight_space() {
    local host_free_kb db_bytes db_kb required_kb
    host_free_kb="$(df -Pk "$PROJECT_DIR" | awk 'NR==2 {print $4}')"
    db_bytes="$(db_query "SELECT pg_database_size(current_database())")"
    db_kb=$(( (db_bytes + 1023) / 1024 ))
    # Оцениваем дамп консервативно по полному размеру базы и сверх него
    # оставляем минимум для слоёв Docker, логов и обычной работы PostgreSQL.
    required_kb=$(( db_kb + MIN_FREE_MB * 1024 ))

    log "Свободно на диске: $(human_kb "$host_free_kb"); база: $(human_kb "$db_kb")"
    if (( host_free_kb < required_kb )); then
        die "Недостаточно места: нужно не меньше $(human_kb "$required_kb") (дамп базы + ${MIN_FREE_MB} МБ запаса), свободно $(human_kb "$host_free_kb")"
    fi
    ok "Места достаточно; после оценочного дампа останется не меньше ${MIN_FREE_MB} МБ"
}

create_pre_deploy_backup() {
    local stamp revision db_bytes db_kb backup_required_kb
    stamp="$(date '+%Y%m%d-%H%M%S')"
    revision="$(git rev-parse --short HEAD)"
    PRE_DEPLOY_BACKUP="${BACKUP_DIR}/crm-pre-deploy-${stamp}-${revision}.dump"
    db_bytes="$(db_query "SELECT pg_database_size(current_database())")"
    db_kb=$(( (db_bytes + 1023) / 1024 ))
    backup_required_kb=$(( db_kb + 256 * 1024 ))

    step "Свежая резервная копия перед миграцией"
    # Команда выполняется новым backend-образом, но пишет в постоянный том
    # backups. Пароль передаётся pg_dump через окружение, а не аргументы.
    if ! docker compose run --rm --no-deps -T worker sh -ceu '
        target="$1"
        required_kb="$2"
        tmp="${target}.tmp"
        set -- $(df -Pk "$(dirname "$target")" | tail -1)
        available_kb="$4"
        if [ "$available_kb" -lt "$required_kb" ]; then
            echo "В томе бэкапов недостаточно места: нужно ${required_kb} КБ, свободно ${available_kb} КБ" >&2
            exit 1
        fi
        trap '\''rm -f "$tmp"'\'' EXIT
        PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
            --host postgres --username "${POSTGRES_USER:-crm}" \
            --dbname "${POSTGRES_DB:-crm}" --format custom --no-owner \
            --file "$tmp"
        test -s "$tmp"
        pg_restore --list "$tmp" >/dev/null
        mv "$tmp" "$target"
        trap - EXIT
        ls -lh "$target"
    ' sh "$PRE_DEPLOY_BACKUP" "$backup_required_kb" 2>&1 | tee -a "$LOG_FILE"; then
        die "Не удалось создать и проверить свежий дамп. Миграции не запускались"
    fi
    ok "Дамп создан и читается: $PRE_DEPLOY_BACKUP"
}

# --- образы для отката ---------------------------------------------------------
tag_previous() {
    for service in "${BUILT_SERVICES[@]}"; do
        local image="crm-${service}:latest"
        if docker image inspect "$image" >/dev/null 2>&1; then
            docker tag "$image" "crm-${service}:previous"
        fi
    done
}

restore_previous() {
    local restored=0
    for service in "${BUILT_SERVICES[@]}"; do
        if docker image inspect "crm-${service}:previous" >/dev/null 2>&1; then
            docker tag "crm-${service}:previous" "crm-${service}:latest"
            restored=1
        fi
    done
    [[ $restored -eq 1 ]]
}

# --- ожидание готовности --------------------------------------------------------
wait_healthy() {
    local deadline=$((SECONDS + HEALTH_TIMEOUT))
    local pending
    while (( SECONDS < deadline )); do
        pending=""
        for name in "${SERVICES[@]}"; do
            local state health
            state="$(container_state "$name")"
            health="$(container_health "$name")"
            case "$state" in
                running)
                    # У beat проверки нет — достаточно, что процесс живой.
                    # unhealthy сразу после старта — нормально, ждём до таймаута.
                    [[ "$health" == "starting" ]] && pending+="$name "
                    [[ "$health" == "unhealthy" ]] && pending+="$name(unhealthy) "
                    ;;
                restarting) pending+="$name(перезапуск) " ;;
                missing)    warn "$name: контейнер не создан"; return 1 ;;
                *)          warn "$name: состояние $state"; return 1 ;;
            esac
        done
        if [[ -z "$pending" ]]; then
            [[ $SECONDS -gt $((deadline - HEALTH_TIMEOUT + 1)) ]] && printf '\n'
            return 0
        fi
        printf '.'
        sleep 3
    done
    printf '\n'
    warn "Не дождались готовности за ${HEALTH_TIMEOUT}с: $pending"
    return 1
}

check_site() {
    local code
    for attempt in 1 2 3 4 5; do
        code="$(curl -sSL -o /dev/null -w '%{http_code}' --max-time 10 "${SITE_URL}/health" || echo 000)"
        [[ "$code" == "200" ]] && return 0
        sleep 3
    done
    warn "Сайт ответил кодом $code вместо 200 (${SITE_URL}/health)"
    return 1
}

assert_rollback_schema_compatible() {
    local current_revision previous_head head_count backup_hint
    docker image inspect crm-backend:previous >/dev/null 2>&1 \
        || die "Предыдущего backend-образа нет — безопасный откат невозможен"

    current_revision="$(current_db_revision)"
    if ! previous_head="$(image_schema_head crm-backend:previous)"; then
        die "Не удалось прочитать Alembic head предыдущего backend-образа"
    fi
    head_count="$(printf '%s\n' "$previous_head" | grep -c . || true)"
    [[ "$head_count" -eq 1 ]] \
        || die "Не удалось однозначно определить схему предыдущего backend-образа"

    if [[ "$current_revision" != "$previous_head" ]]; then
        backup_hint="${PRE_DEPLOY_BACKUP:-последний ${BACKUP_DIR}/crm-pre-deploy-*.dump}"
        die "Откат запрещён: база уже на ревизии $current_revision, а предыдущий backend ожидает $previous_head. Старый образ автоматически не запускаем. Используйте $backup_hint и исправление вперёд либо согласованное восстановление базы"
    fi
    ok "Схема $current_revision совместима с предыдущим backend-образом"
}

rollback() {
    step "Откат на предыдущие образы"
    assert_rollback_schema_compatible
    if restore_previous; then
        docker compose up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"
        if wait_healthy; then
            ok "Откат выполнен, работает предыдущая версия"
        else
            die "Откат не помог — смотрите: docker compose logs backend --tail 50"
        fi
    else
        die "Предыдущих образов нет (первый деплой?) — откатывать нечего"
    fi
}

release_failed() {
    local reason="$1"
    warn "$reason"
    if [[ "$SCHEMA_CHANGED" -eq 1 ]]; then
        warn "Схема базы уже изменилась. Автооткат старых образов ЗАПРЕЩЁН."
        warn "Свежий дамп до миграции: $PRE_DEPLOY_BACKUP"
        die "Оставляем новые образы для диагностики и исправления вперёд; старый backend не запускаем"
    fi
    rollback
    die "Деплой отменён, версия возвращена. Журнал: $LOG_FILE"
}

# =============================================================================
#  Сценарии
# =============================================================================
# Тесты безопасности загружают функции без обращения к Docker/production.
if [[ "${DEPLOY_SOURCE_ONLY:-0}" == "1" ]]; then
    return 0 2>/dev/null || exit 0
fi

require_env

# Состояние можно смотреть в любой момент, в том числе во время деплоя.
if [[ "$MODE" == "status" ]]; then
    show_status
    docker compose ps
    exit 0
fi

exec 9>"$LOCK_FILE"
flock -n 9 || die "Деплой уже идёт (если завис — снять: rm -f $LOCK_FILE)"

case "$MODE" in
    rollback)
        rollback
        show_status
        exit 0
        ;;
esac

START_TS=$SECONDS
log ""
log "════ Деплой $(date '+%Y-%m-%d %H:%M:%S') ════"

# --- 1. Код -------------------------------------------------------------------
if [[ $DO_PULL -eq 1 ]]; then
    step "Обновление кода"
    if [[ -n "$(git status --porcelain)" ]]; then
        git status --short | tee -a "$LOG_FILE"
        die "В каталоге есть незакоммиченные изменения. Уберите их или запустите с --skip-pull"
    fi
    BRANCH="$(git rev-parse --abbrev-ref HEAD)"
    BEFORE="$(git rev-parse --short HEAD)"
    git pull --ff-only 2>&1 | tee -a "$LOG_FILE"
    AFTER="$(git rev-parse --short HEAD)"
    if [[ "$BEFORE" == "$AFTER" ]]; then
        ok "Ветка $BRANCH уже актуальна ($AFTER)"
    else
        ok "Ветка $BRANCH: $BEFORE → $AFTER"
        git --no-pager log --oneline "${BEFORE}..${AFTER}" | sed 's/^/    /' | tee -a "$LOG_FILE"
    fi
else
    ok "Обновление кода пропущено (--skip-pull)"
fi

# --- 2. Preflight --------------------------------------------------------------
step "Проверка PostgreSQL, Valkey и свободного места"
# Если сеть уже устаревшая, Compose не должен частично пересоздавать её,
# пока работающие контейнеры приложения удерживают endpoints.
prepare_core_services
preflight_space

# --- 3. Сборка -----------------------------------------------------------------
tag_previous
if [[ $DO_BUILD -eq 1 ]]; then
    step "Сборка образов"
    if ! docker compose build 2>&1 | tee -a "$LOG_FILE"; then
        die "Сборка не удалась — стек не тронут, сайт продолжает работать на старой версии"
    fi
    ok "Образы собраны"
else
    ok "Сборка пропущена (--no-build)"
fi

# Сборка могла занять заметную часть диска: повторно считаем место уже перед
# дампом, чтобы обещанный запас действительно остался после его создания.
preflight_space
# Дамп создаётся после сборки (нужен образ с pg_dump), но строго до остановки
# приложения и до любых миграций.
create_pre_deploy_backup

# --- 4. Управляемая миграция ----------------------------------------------------
DB_REVISION_BEFORE="$(current_db_revision)"
if ! NEW_IMAGE_HEAD="$(image_schema_head crm-backend:latest)"; then
    die "Не удалось прочитать Alembic head нового backend-образа"
fi
HEAD_COUNT="$(printf '%s\n' "$NEW_IMAGE_HEAD" | grep -c . || true)"
[[ "$HEAD_COUNT" -eq 1 ]] \
    || die "Не удалось однозначно определить целевую ревизию нового backend-образа"
log "Схема базы до миграции: $DB_REVISION_BEFORE; цель нового образа: $NEW_IMAGE_HEAD"

# При смене параметров сети останавливаем стек только после проверенного дампа;
# затем поднимаем базу и кеш в новой сети до запуска миграции.
recreate_internal_network_if_needed

if [[ "$NETWORK_TRANSITION_REQUIRED" -eq 1 ]]; then
    ok "Приложение уже остановлено для переключения сети"
else
    step "Остановка процессов, которые пишут в базу"
    docker compose stop backend worker beat 2>&1 | tee -a "$LOG_FILE"
fi

step "Миграция базы отдельным шагом"
if ! docker compose run --rm --no-deps -T backend alembic upgrade head \
    2>&1 | tee -a "$LOG_FILE"; then
    DB_REVISION_AFTER="$(current_db_revision)"
    [[ "$DB_REVISION_AFTER" != "$DB_REVISION_BEFORE" ]] && SCHEMA_CHANGED=1
    release_failed "Миграция завершилась ошибкой (было $DB_REVISION_BEFORE, стало $DB_REVISION_AFTER)"
fi

DB_REVISION_AFTER="$(current_db_revision)"
[[ "$DB_REVISION_AFTER" != "$DB_REVISION_BEFORE" ]] && SCHEMA_CHANGED=1
if [[ "$DB_REVISION_AFTER" != "$NEW_IMAGE_HEAD" ]]; then
    release_failed "После миграции база на $DB_REVISION_AFTER вместо ожидаемой $NEW_IMAGE_HEAD"
fi
ok "Схема базы готова: $DB_REVISION_AFTER"

# --- 5. Запуск ------------------------------------------------------------------
step "Запуск контейнеров"
if ! docker compose up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"; then
    release_failed "Docker Compose не смог запустить новый релиз"
fi

step "Ожидание готовности"
if ! wait_healthy; then
    docker compose logs backend --tail 30 2>&1 | tee -a "$LOG_FILE"
    release_failed "Контейнеры не вышли в рабочее состояние"
fi
ok "Все контейнеры в рабочем состоянии"

if ! check_site; then
    docker compose logs nginx --tail 20 2>&1 | tee -a "$LOG_FILE"
    release_failed "Сайт не отвечает после обновления"
fi
ok "Сайт отвечает: ${SITE_URL}"

# --- 6. Итоги -------------------------------------------------------------------
step "Уборка"
docker image prune -f >/dev/null 2>&1 || true
ok "Старые образы удалены, свободно: $(df -h / | awk 'NR==2 {print $4}')"

if [[ "$SCHEMA_CHANGED" -eq 1 ]]; then
    warn "Схема изменилась: $DB_REVISION_BEFORE → $DB_REVISION_AFTER."
    warn "Ручной --rollback не запустит старый backend с этой схемой."
fi
ok "Предмиграционный дамп: $PRE_DEPLOY_BACKUP"

log ""
ok "Готово за $((SECONDS - START_TS)) с. Версия: $(git rev-parse --short HEAD)"
log "${C_DIM}Журнал: $LOG_FILE · состояние: ./deploy.sh --status · откат: ./deploy.sh --rollback${C_OFF}"
