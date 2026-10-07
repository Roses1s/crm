"""Регрессии безопасного деплоя и отката схемы.

Docker в unit-тестах не нужен: deploy.sh позволяет загрузить только функции,
после чего внешние команды заменяются короткими shell-заглушками.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy.sh"


def run_shell(body: str, tmp_path: Path) -> subprocess.CompletedProcess[str]:
    env = os.environ | {"DEPLOY_SOURCE_ONLY": "1", "TEST_LOG": str(tmp_path / "deploy.log")}
    return subprocess.run(
        [
            "bash",
            "-c",
            'DEPLOY_PATH="$1"; BODY="$2"; set --; source "$DEPLOY_PATH"; '
            'LOG_FILE="$TEST_LOG"; eval "$BODY"',
            "bash",
            str(DEPLOY),
            body,
        ],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )


def test_deploy_script_has_valid_shell_syntax() -> None:
    result = subprocess.run(
        ["bash", "-n", str(DEPLOY)], text=True, capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr


def test_rollback_rejects_database_revision_from_newer_image(tmp_path: Path) -> None:
    result = run_shell(
        """
        docker() { return 0; }
        current_db_revision() { echo new_revision; }
        image_schema_head() { echo old_revision; }
        assert_rollback_schema_compatible
        """,
        tmp_path,
    )
    assert result.returncode != 0
    assert "Откат запрещён" in result.stdout
    assert "Старый образ автоматически не запускаем" in result.stdout


def test_rollback_accepts_exactly_matching_database_revision(tmp_path: Path) -> None:
    result = run_shell(
        """
        docker() { return 0; }
        current_db_revision() { echo same_revision; }
        image_schema_head() { echo same_revision; }
        assert_rollback_schema_compatible
        """,
        tmp_path,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "совместима" in result.stdout


def test_failed_release_never_calls_rollback_after_schema_change(tmp_path: Path) -> None:
    marker = tmp_path / "rollback-called"
    result = run_shell(
        f"""
        SCHEMA_CHANGED=1
        PRE_DEPLOY_BACKUP=/var/backups/crm/pre-deploy.dump
        rollback() {{ touch {marker}; }}
        release_failed "новый контейнер не поднялся"
        """,
        tmp_path,
    )
    assert result.returncode != 0
    assert not marker.exists()
    assert "Автооткат старых образов ЗАПРЕЩЁН" in result.stdout


def test_preflight_stops_when_dump_would_leave_too_little_space(tmp_path: Path) -> None:
    result = run_shell(
        """
        MIN_FREE_MB=2048
        df() { printf 'fs blocks used available mount\nroot 1 1 1000000 /\n'; }
        db_query() { echo 524288000; }
        preflight_space
        """,
        tmp_path,
    )
    assert result.returncode != 0
    assert "Недостаточно места" in result.stdout


def test_old_network_defers_compose_until_after_the_backup(tmp_path: Path) -> None:
    result = run_shell(
        """
        TRACE_FILE="${TEST_LOG}.docker"
        docker() {
            printf '%s\\n' "$*" >> "$TRACE_FILE"
            case "$1" in
                network) echo false ;;
                inspect)
                    case "$3" in
                        "{{.State.Status}}") echo running ;;
                        "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}") echo healthy ;;
                        *) echo "Неожиданная команда inspect: $*" >&2; return 90 ;;
                    esac
                    ;;
                *) echo "До проверенного дампа запрещена команда: $*" >&2; return 91 ;;
            esac
        }
        prepare_core_services
        printf 'transition=%s\\n' "$NETWORK_TRANSITION_REQUIRED"
        """,
        tmp_path,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "transition=1" in result.stdout
    calls = (tmp_path / "deploy.log.docker").read_text(encoding="utf-8").splitlines()
    assert any(call.startswith("network inspect ") for call in calls)
    assert not any(call.startswith("compose ") for call in calls)


def test_internal_network_preflight_starts_core_services_and_verifies_network(
    tmp_path: Path,
) -> None:
    result = run_shell(
        """
        TRACE_FILE="${TEST_LOG}.docker"
        docker() {
            printf '%s\\n' "$*" >> "$TRACE_FILE"
            case "$1" in
                network) echo true ;;
                inspect)
                    case "$3" in
                        "{{.State.Status}}") echo running ;;
                        "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}") echo healthy ;;
                        *) echo "Неожиданная команда inspect: $*" >&2; return 90 ;;
                    esac
                    ;;
                compose)
                    [[ "$2" == up && "$3" == -d && "$4" == postgres && "$5" == valkey ]] || {
                        echo "Неожиданная команда Compose: $*" >&2
                        return 91
                    }
                    ;;
                *) echo "Неожиданная команда Docker: $*" >&2; return 92 ;;
            esac
        }
        prepare_core_services
        """,
        tmp_path,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "deploy.log.docker").read_text(encoding="utf-8").splitlines()
    network_checks = [
        index
        for index, call in enumerate(calls)
        if call == "network inspect --format {{.Internal}} crm_internal"
    ]
    assert len(network_checks) == 2
    assert calls.index("compose up -d postgres valkey") < network_checks[1]
    assert not any(call.startswith("compose down ") for call in calls)


def test_network_transition_keeps_volumes_and_waits_for_core_services(tmp_path: Path) -> None:
    result = run_shell(
        """
        TRACE_FILE="${TEST_LOG}.docker"
        BACKUP_OK="${TEST_LOG}.backup-ok"
        NETWORK_READY="${TEST_LOG}.network-ready"
        docker() {
            printf '%s\\n' "$*" >> "$TRACE_FILE"
            case "$1" in
                network)
                    if [[ -f "$NETWORK_READY" ]]; then echo true; else echo false; fi
                    ;;
                inspect)
                    case "$3" in
                        "{{.State.Status}}") echo running ;;
                        "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}") echo healthy ;;
                        *) echo "Неожиданная команда inspect: $*" >&2; return 90 ;;
                    esac
                    ;;
                compose)
                    case "$2:$3" in
                        down:--remove-orphans)
                            [[ -f "$BACKUP_OK" ]] || {
                                echo "Стек остановлен до готового дампа" >&2
                                return 91
                            }
                            ;;
                        up:-d)
                            [[ "$4" == postgres && "$5" == valkey ]] || {
                                echo "Сеть подготавливается не только для PostgreSQL/Valkey" >&2
                                return 92
                            }
                            touch "$NETWORK_READY"
                            ;;
                        *) echo "Неожиданная команда Compose: $*" >&2; return 93 ;;
                    esac
                    ;;
                *) echo "Неожиданная команда Docker: $*" >&2; return 94 ;;
            esac
        }
        prepare_core_services
        touch "$BACKUP_OK" # Успешный pg_restore --list в настоящем деплое.
        recreate_internal_network_if_needed
        printf 'alembic upgrade head\\n' >> "$TRACE_FILE"
        """,
        tmp_path,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    calls = (tmp_path / "deploy.log.docker").read_text(encoding="utf-8").splitlines()
    down = next(call for call in calls if call.startswith("compose down "))
    assert down == "compose down --remove-orphans"  # Без -v: тома сохраняются.
    up_index = calls.index("compose up -d postgres valkey")
    migration_index = calls.index("alembic upgrade head")
    assert calls.index(down) < up_index < migration_index
    assert calls[up_index + 1].startswith("inspect -f {{if .State.Health}}")
    network_check = calls.index("network inspect --format {{.Internal}} crm_internal", up_index)
    assert up_index < network_check < migration_index


def test_backup_network_preparation_and_migration_are_ordered() -> None:
    deploy = DEPLOY.read_text(encoding="utf-8")
    main = deploy.split("# --- 2. Preflight", maxsplit=1)[1]
    assert main.index("prepare_core_services") < main.index("create_pre_deploy_backup")
    assert main.index("create_pre_deploy_backup") < main.index(
        "recreate_internal_network_if_needed"
    )
    assert main.index("recreate_internal_network_if_needed") < main.index("alembic upgrade head")
    assert "pg_dump" in deploy
    assert "pg_restore --list" in deploy

    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    backend = compose.split("  backend:", maxsplit=1)[1].split("  worker:", maxsplit=1)[0]
    assert "alembic upgrade" not in backend
