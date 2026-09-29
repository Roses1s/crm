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
#    * запоминает текущие образы и откатывается на них, если релиз не поднялся;
#    * ждёт, пока контейнеры станут healthy, и проверяет сайт снаружи;
#    * пишет журнал и подчищает старые образы (диск здесь всего 15 ГБ).
# =============================================================================

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCK_FILE="/tmp/crm-deploy.lock"
LOG_FILE="${PROJECT_DIR}/.deploy.log"
SITE_URL="${SITE_URL:-https://crmdetroid.ru}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-180}"   # секунд ждать готовности контейнеров
BUILT_SERVICES=(backend frontend)
SERVICES=(crm-postgres crm-valkey crm-backend crm-worker crm-beat crm-frontend crm-nginx)

DO_PULL=1
DO_BUILD=1
MODE="deploy"

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
    docker compose version >/dev/null 2>&1 || die "docker compose не установлен"
    [[ -f docker-compose.yml ]] || die "docker-compose.yml не найден в $PROJECT_DIR"
    [[ -f .env ]] || die ".env отсутствует — скопируйте .env.example и заполните секреты"
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

rollback() {
    step "Откат на предыдущие образы"
    if restore_previous; then
        docker compose up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"
        if wait_healthy; then
            ok "Откат выполнен, работает предыдущая версия"
        else
            die "Откат не помог — смотрите: docker compose logs backend --tail 50"
        fi
    else
        warn "Предыдущих образов нет (первый деплой?) — откатывать нечего"
    fi
}

# =============================================================================
#  Сценарии
# =============================================================================
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

# --- 2. Сборка -----------------------------------------------------------------
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

# --- 3. Запуск ------------------------------------------------------------------
step "Запуск контейнеров"
docker compose up -d --remove-orphans 2>&1 | tee -a "$LOG_FILE"

step "Ожидание готовности"
if ! wait_healthy; then
    warn "Контейнеры не вышли в рабочее состояние"
    docker compose logs backend --tail 30 2>&1 | tee -a "$LOG_FILE"
    rollback
    die "Деплой отменён, версия возвращена. Журнал: $LOG_FILE"
fi
ok "Все контейнеры в рабочем состоянии"

if ! check_site; then
    docker compose logs nginx --tail 20 2>&1 | tee -a "$LOG_FILE"
    rollback
    die "Сайт не отвечает после обновления, версия возвращена. Журнал: $LOG_FILE"
fi
ok "Сайт отвечает: ${SITE_URL}"

# --- 4. Итоги -------------------------------------------------------------------
step "Уборка"
docker image prune -f >/dev/null 2>&1 || true
ok "Старые образы удалены, свободно: $(df -h / | awk 'NR==2 {print $4}')"

MIGRATIONS="$(docker compose logs backend 2>/dev/null | grep -c 'Running upgrade' || true)"
if [[ "${MIGRATIONS:-0}" -gt 0 ]]; then
    warn "В этом запуске применялись миграции базы ($MIGRATIONS шт.)."
    warn "Откат образов НЕ отменяет миграции — схема останется новой."
fi

log ""
ok "Готово за $((SECONDS - START_TS)) с. Версия: $(git rev-parse --short HEAD)"
log "${C_DIM}Журнал: $LOG_FILE · состояние: ./deploy.sh --status · откат: ./deploy.sh --rollback${C_OFF}"
