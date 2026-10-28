#!/usr/bin/env bash
# Запускается НА КОМПЬЮТЕРЕ ВЛАДЕЛЬЦА, а не на production-сервере.
# Создаёт зашифрованный переносимый архив CRM через SSH.
set -Eeuo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REMOTE_STAGE_SCRIPT="$ROOT/deploy/create-recovery-stage.sh"

usage() {
    cat >&2 <<'USAGE'
Использование:
  ./deploy/export-recovery-bundle.sh [путь-к-файлу.tar.age] [ssh-алиас]

По умолчанию архив сохранится в ~/crm-recovery/ с именем по времени UTC,
а SSH-подключение будет выполнено к алиасу crm.
USAGE
}

if (($# > 2)); then
    usage
    exit 2
fi

REMOTE="${2:-${CRM_SSH_ALIAS:-crm}}"
DEFAULT_DIR="${CRM_RECOVERY_DIR:-$HOME/crm-recovery}"
DEFAULT_NAME="crm-recovery-$(date -u '+%Y%m%dT%H%M%SZ').tar.age"
OUTPUT="${1:-$DEFAULT_DIR/$DEFAULT_NAME}"

fail() { printf '[crm-recovery] ОСТАНОВКА: %s\n' "$*" >&2; exit 1; }

for command_name in ssh age tar sha256sum grep mktemp chmod; do
    command -v "$command_name" >/dev/null 2>&1 || fail "На компьютере не найдена команда: $command_name"
done
[[ -r "$REMOTE_STAGE_SCRIPT" ]] || fail "Не найден файл $REMOTE_STAGE_SCRIPT"
[[ -r /dev/tty && -w /dev/tty ]] || fail "Запускайте скрипт из интерактивного терминала: age запросит парольную фразу"

if [[ "$OUTPUT" != /* ]]; then
    OUTPUT="$PWD/$OUTPUT"
fi
case "$OUTPUT" in
    "$ROOT"/*) fail "Не сохраняйте production-бэкап внутри клона Git. Укажите внешний путь, например ~/crm-recovery/backup.tar.age" ;;
esac
OUTPUT_DIR="$(dirname "$OUTPUT")"
OUTPUT_NAME="$(basename "$OUTPUT")"
mkdir -p -- "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"
OUTPUT="$OUTPUT_DIR/$OUTPUT_NAME"
case "$OUTPUT" in
    "$ROOT"/*) fail "Не сохраняйте production-бэкап внутри клона Git. Укажите внешний путь, например ~/crm-recovery/backup.tar.age" ;;
esac
[[ ! -e "$OUTPUT" ]] || fail "Файл уже существует; он не будет перезаписан: $OUTPUT"
[[ ! -e "$OUTPUT.partial" ]] || fail "Уже существует незавершённый файл: $OUTPUT.partial"

LOCAL_STAGE="$(mktemp -d "${TMPDIR:-/tmp}/crm-recovery-local-XXXXXXXXXX")"
chmod 700 "$LOCAL_STAGE"
REMOTE_STAGE=""

on_exit() {
    local result=$?
    trap - EXIT
    if [[ -n "$LOCAL_STAGE" && -d "$LOCAL_STAGE" ]]; then
        rm -rf -- "$LOCAL_STAGE"
    fi
    if [[ "$result" -ne 0 && -e "$OUTPUT.partial" ]]; then
        printf '[crm-recovery] Незавершённый/непроверенный зашифрованный файл оставлен: %s.partial\n' "$OUTPUT" >&2
    fi
    if [[ "$result" -ne 0 && -n "$REMOTE_STAGE" ]]; then
        printf '[crm-recovery] Временная копия сохранена на сервере: %s\n' "$REMOTE_STAGE" >&2
        printf '[crm-recovery] После проверки или повторной передачи её можно удалить только этой командой:\n' >&2
        printf '  ssh %q %q\n' "$REMOTE" "rm -rf -- '$REMOTE_STAGE'" >&2
    fi
    exit "$result"
}
trap on_exit EXIT

printf 'Будет короткое окно обслуживания: backend, worker и beat остановятся для согласованного снимка базы и вложений.\n' >&2
printf 'Продолжать? Введите SNAPSHOT: ' >&2
IFS= read -r confirmation < /dev/tty
[[ "$confirmation" == "SNAPSHOT" ]] || fail "Отменено; production-сервер не менялся"

printf '[crm-recovery] Готовлю согласованный снимок на сервере %s\n' "$REMOTE" >&2
REMOTE_STAGE="$(ssh -T "$REMOTE" 'bash -s' < "$REMOTE_STAGE_SCRIPT")"
[[ "$REMOTE_STAGE" =~ ^/tmp/crm-recovery-[A-Za-z0-9]+$ ]] \
    || fail "Сервер вернул неожиданный путь временной копии; ничего не удаляю"

printf '[crm-recovery] Передаю временные файлы по SSH на этот компьютер\n' >&2
ssh -T "$REMOTE" \
    "tar -C '$REMOTE_STAGE' -cf - MANIFEST.txt SHA256SUMS database.dump attachments.tar.gz source.tar.gz .env" \
    | tar -xf - -C "$LOCAL_STAGE"

for file in MANIFEST.txt SHA256SUMS database.dump attachments.tar.gz source.tar.gz .env; do
    [[ -s "$LOCAL_STAGE/$file" ]] || fail "В передаче отсутствует файл $file"
done
(
    cd "$LOCAL_STAGE"
    sha256sum --check SHA256SUMS
)
tar -tzf "$LOCAL_STAGE/attachments.tar.gz" >/dev/null || fail "Архив вложений не прошёл проверку"
tar -tzf "$LOCAL_STAGE/source.tar.gz" >/dev/null || fail "Архив исходного кода не прошёл проверку"

printf '[crm-recovery] Шифрую архив паролем-фразой age. Сохраните её в менеджере паролей отдельно от файла.\n' >&2
(
    cd "$LOCAL_STAGE"
    tar -cf - MANIFEST.txt SHA256SUMS database.dump attachments.tar.gz source.tar.gz .env
) | age -p -o "$OUTPUT.partial"
chmod 600 "$OUTPUT.partial"

printf '[crm-recovery] Проверяю, что архив расшифровывается и содержит все части\n' >&2
age -d -p "$OUTPUT.partial" | tar -tf - > "$LOCAL_STAGE/package-files.txt"
for file in MANIFEST.txt SHA256SUMS database.dump attachments.tar.gz source.tar.gz .env; do
    grep -Fxq "$file" "$LOCAL_STAGE/package-files.txt" || fail "В зашифрованном архиве не найден $file"
done

mv -- "$OUTPUT.partial" "$OUTPUT"
chmod 600 "$OUTPUT"

printf '[crm-recovery] Удаляю только временный каталог, созданный этим экспортом\n' >&2
if ssh -T "$REMOTE" "rm -rf -- '$REMOTE_STAGE'"; then
    REMOTE_STAGE=""
else
    printf '[crm-recovery] Архив готов, но временный каталог на сервере не удалён: %s\n' "$REMOTE_STAGE" >&2
fi

printf '\nЗашифрованная копия готова: %s\n' "$OUTPUT"
printf 'Храните её вне VPS минимум в двух независимых местах; парольную фразу — отдельно.\n'
