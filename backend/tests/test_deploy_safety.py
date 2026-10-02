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


def test_backup_and_migration_are_explicit_and_ordered() -> None:
    deploy = DEPLOY.read_text(encoding="utf-8")
    main = deploy.split("# --- 2. Preflight", maxsplit=1)[1]
    assert main.index("create_pre_deploy_backup") < main.index("alembic upgrade head")
    assert "pg_dump" in deploy
    assert "pg_restore --list" in deploy

    compose = (ROOT / "docker-compose.yml").read_text(encoding="utf-8")
    backend = compose.split("  backend:", maxsplit=1)[1].split("  worker:", maxsplit=1)[0]
    assert "alembic upgrade" not in backend
