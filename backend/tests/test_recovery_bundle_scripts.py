"""Проверки переносимого экспорта без доступа к Docker или production."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REMOTE_STAGE = ROOT / "deploy" / "create-recovery-stage.sh"
LOCAL_EXPORT = ROOT / "deploy" / "export-recovery-bundle.sh"


FAKE_DOCKER = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_DOCKER_LOG"

if [[ "$1" == "inspect" ]]; then
    if [[ "$*" == *".State.Health"* ]]; then
        printf 'healthy\n'
    else
        printf 'running\n'
    fi
    exit 0
fi

if [[ "$1" != "compose" ]]; then
    exit 0
fi

case "$2" in
    ps)
        service="${@: -1}"
        case "$service" in
            postgres|backend|worker|beat) printf 'container-%s\n' "$service" ;;
        esac
        ;;
    exec)
        if [[ "$*" == *"pg_database_size"* ]]; then
            printf '1024\n'
        elif [[ "$*" == *"SELECT (SELECT count(*)"* ]]; then
            printf '2|3|4|5\n'
        elif [[ "$*" == *"pg_dump"* ]]; then
            if [[ "${FAKE_DOCKER_FAIL_PGDUMP:-0}" == "1" ]]; then
                printf 'simulated pg_dump failure\n' >&2
                exit 70
            fi
            printf 'fake-custom-format-dump\n'
        elif [[ "$*" == *"pg_restore --list"* ]]; then
            cat >/dev/null
            printf 'TOC entry 1; 0 0 COMMENT -\n'
        else
            printf 'PostgreSQL 18.0\n'
        fi
        ;;
    run)
        if [[ "$*" == *"python -c"* ]]; then
            printf '0\n'
        elif [[ "$*" == *"python -"* ]]; then
            python - <<'PY'
import io
import sys
import tarfile

buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
    root = tarfile.TarInfo("attachments/")
    root.type = tarfile.DIRTYPE
    archive.addfile(root)
    item = b"test attachment"
    member = tarfile.TarInfo("attachments/test.txt")
    member.size = len(item)
    archive.addfile(member, io.BytesIO(item))
sys.stdout.buffer.write(buffer.getvalue())
PY
        fi
        ;;
    start)
        if [[ "${FAKE_DOCKER_FAIL_START:-0}" == "1" ]]; then
            printf 'simulated service start failure\n' >&2
            exit 71
        fi
        ;;
    stop)
        ;;
    version)
        printf '2.40.1\n'
        ;;
    images)
        printf 'SERVICE REPOSITORY TAG IMAGE ID SIZE\n'
        ;;
esac
"""


def _fake_project(tmp_path: Path) -> Path:
    project = tmp_path / "crm-project"
    project.mkdir()
    (project / "docker-compose.yml").write_text("services: {}\n", encoding="utf-8")
    (project / ".gitignore").write_text(".env\n", encoding="utf-8")
    (project / ".env").write_text(
        f"SECRET_KEY={'a' * 64}\nPOSTGRES_USER=crm\nPOSTGRES_PASSWORD={'b' * 48}\nPOSTGRES_DB=crm\n",
        encoding="utf-8",
    )
    (project / "README.md").write_text("test fixture\n", encoding="utf-8")
    subprocess.run(["git", "init", "-q", str(project)], check=True)
    subprocess.run(["git", "-C", str(project), "config", "user.name", "Recovery Test"], check=True)
    subprocess.run(
        ["git", "-C", str(project), "config", "user.email", "recovery-test@example.invalid"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(project), "add", ".gitignore", "README.md", "docker-compose.yml"],
        check=True,
    )
    subprocess.run(["git", "-C", str(project), "commit", "-qm", "fixture"], check=True)
    return project


def _fake_docker(tmp_path: Path, log_file: Path) -> Path:
    binary_dir = tmp_path / "bin"
    binary_dir.mkdir()
    docker = binary_dir / "docker"
    docker.write_text(FAKE_DOCKER, encoding="utf-8")
    docker.chmod(0o755)
    log_file.write_text("", encoding="utf-8")
    return binary_dir


def _run_remote_stage(
    tmp_path: Path, *, fail_pg_dump: bool = False, fail_start: bool = False
) -> tuple[subprocess.CompletedProcess[str], Path, Path]:
    project = _fake_project(tmp_path)
    stage_root = tmp_path / "stage-root"
    stage_root.mkdir()
    log_file = tmp_path / "docker.log"
    binary_dir = _fake_docker(tmp_path, log_file)
    env = os.environ | {
        "PATH": f"{binary_dir}{os.pathsep}{os.environ['PATH']}",
        "CRM_PROJECT_DIR": str(project),
        "CRM_RECOVERY_STAGE_ROOT": str(stage_root),
        "FAKE_DOCKER_LOG": str(log_file),
        "FAKE_DOCKER_FAIL_PGDUMP": "1" if fail_pg_dump else "0",
        "FAKE_DOCKER_FAIL_START": "1" if fail_start else "0",
    }
    result = subprocess.run(
        ["bash", str(REMOTE_STAGE)],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )
    return result, stage_root, log_file


def test_export_scripts_have_valid_shell_syntax() -> None:
    for script in (REMOTE_STAGE, LOCAL_EXPORT):
        result = subprocess.run(
            ["bash", "-n", str(script)], text=True, capture_output=True, check=False
        )
        assert result.returncode == 0, result.stderr


def test_local_export_normalizes_and_spools_remote_script_input() -> None:
    local = LOCAL_EXPORT.read_text(encoding="utf-8")
    expected_pipeline = (
        'sed \'s/\\r$//\' "$REMOTE_STAGE_SCRIPT" | ssh -T "$REMOTE" "$REMOTE_STAGE_COMMAND"'
    )
    assert expected_pipeline in local
    assert "chmod sed; do" in local

    assignment = next(
        line for line in local.splitlines() if line.startswith("REMOTE_STAGE_COMMAND=")
    )
    command_result = subprocess.run(
        ["bash", "-c", f'{assignment}\nprintf "%s" "$REMOTE_STAGE_COMMAND"'],
        capture_output=True,
        check=False,
    )
    assert command_result.returncode == 0, command_result.stderr
    remote_command = command_result.stdout.decode()

    # This simulates a Compose command that reads stdin. It must not consume
    # any of the streamed recovery helper before Bash executes it.
    helper = b'cat >/dev/null\nprintf "HELPER_RAN\\n"\n'
    staged = subprocess.run(
        ["bash", "-c", remote_command], input=helper, capture_output=True, check=False
    )
    assert staged.returncode == 0, staged.stderr
    assert staged.stdout == b"HELPER_RAN\n"

    for script in (LOCAL_EXPORT, REMOTE_STAGE):
        relative_script = script.relative_to(ROOT).as_posix()
        attributes = subprocess.run(
            ["git", "check-attr", "eol", "--", relative_script],
            cwd=ROOT,
            text=True,
            capture_output=True,
            check=True,
        )
        assert f"{relative_script}: eol: lf" in attributes.stdout

    crlf_source = REMOTE_STAGE.read_bytes().replace(b"\n", b"\r\n")
    normalized = subprocess.run(
        ["sed", r"s/\r$//"], input=crlf_source, capture_output=True, check=False
    )
    assert normalized.returncode == 0, normalized.stderr
    assert b"\r" not in normalized.stdout

    syntax = subprocess.run(
        ["bash", "-n"], input=normalized.stdout, capture_output=True, check=False
    )
    assert syntax.returncode == 0, syntax.stderr


def test_remote_stage_creates_verified_payload_and_restarts_services(tmp_path: Path) -> None:
    result, stage_root, log_file = _run_remote_stage(tmp_path)

    assert result.returncode == 0, result.stdout + result.stderr
    stage_dir = Path(result.stdout.strip())
    assert stage_dir.parent == stage_root
    assert (stage_dir / "database.dump").read_bytes() == b"fake-custom-format-dump\n"
    assert (stage_dir / ".env").stat().st_mode & 0o777 == 0o600
    assert "source_commit=" in (stage_dir / "MANIFEST.txt").read_text(encoding="utf-8")

    calls = log_file.read_text(encoding="utf-8").splitlines()
    assert any("compose stop --timeout 60 beat" in call for call in calls)
    assert any("compose stop --timeout 60 worker" in call for call in calls)
    assert any("compose stop --timeout 60 backend" in call for call in calls)
    assert any("compose start backend worker beat" in call for call in calls)

    check = subprocess.run(
        ["sha256sum", "--check", "SHA256SUMS"],
        cwd=stage_dir,
        text=True,
        capture_output=True,
        check=False,
    )
    assert check.returncode == 0, check.stdout + check.stderr
    listing = subprocess.run(
        ["tar", "-tzf", str(stage_dir / "attachments.tar.gz")],
        text=True,
        capture_output=True,
        check=False,
    )
    assert listing.returncode == 0, listing.stderr
    assert "attachments/test.txt" in listing.stdout


def test_failed_database_dump_restarts_services_and_removes_partial_stage(tmp_path: Path) -> None:
    result, stage_root, log_file = _run_remote_stage(tmp_path, fail_pg_dump=True)

    assert result.returncode != 0
    calls = log_file.read_text(encoding="utf-8").splitlines()
    assert any("compose start backend worker beat" in call for call in calls)
    assert list(stage_root.iterdir()) == []


def test_service_start_failure_preserves_the_recovery_stage(tmp_path: Path) -> None:
    result, stage_root, _ = _run_remote_stage(tmp_path, fail_start=True)

    assert result.returncode != 0
    assert "Оставляю временные файлы" in result.stderr
    stage_dirs = list(stage_root.iterdir())
    assert len(stage_dirs) == 1
    assert (stage_dirs[0] / "database.dump").is_file()


def test_export_scripts_do_not_remove_docker_data_or_skip_encryption() -> None:
    remote = REMOTE_STAGE.read_text(encoding="utf-8")
    local = LOCAL_EXPORT.read_text(encoding="utf-8")

    assert "trap on_exit EXIT" in remote
    assert "resume_services" in remote
    assert "docker compose down" not in remote
    assert "docker volume prune" not in remote
    assert "docker system prune" not in remote
    assert 'age -p -o "$OUTPUT.partial"' in local
    assert 'age -d "$OUTPUT.partial" | tar -tf -' in local
    assert 'age -d -p "$OUTPUT.partial"' not in local
    assert "SNAPSHOT" in local
    assert "docker compose down" not in local
    assert "docker volume prune" not in local
