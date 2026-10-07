"""Проверки отчёта о дублях на временной копии из restore-test.sh."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RESTORE_TEST = ROOT / "deploy" / "restore-test.sh"


def test_restore_test_script_has_valid_shell_syntax() -> None:
    result = subprocess.run(
        ["bash", "-n", str(RESTORE_TEST)], text=True, capture_output=True, check=False
    )
    assert result.returncode == 0, result.stderr


def test_duplicate_report_reads_only_the_restored_copy(tmp_path: Path) -> None:
    trace_file = tmp_path / "docker.log"
    fake_docker = tmp_path / "docker"
    fake_docker.write_text(
        "#!/usr/bin/env bash\n"
        "set -euo pipefail\n"
        "printf '%s' \"$*\" | tr '\\n' ' ' >> \"$TRACE_FILE\"\n"
        "printf '\\n' >> \"$TRACE_FILE\"\n"
        'if [[ "$*" == *"GROUP BY number"* ]]; then\n'
        '  [[ "$*" == *"-d crm_restore_test"* ]] || exit 70\n'
        "  printf 'ЗНТ-042 | 2 | 17, 21\\n'\n"
        "fi\n",
        encoding="utf-8",
    )
    fake_docker.chmod(0o755)
    env = os.environ | {
        "PATH": f"{tmp_path}{os.pathsep}{os.environ['PATH']}",
        "TRACE_FILE": str(trace_file),
    }

    result = subprocess.run(
        ["bash", str(RESTORE_TEST), "/var/backups/crm/test-copy.dump"],
        cwd=ROOT,
        env=env,
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert "ЗНТ-042 | 2 | 17, 21" in result.stdout

    calls = trace_file.read_text(encoding="utf-8").splitlines()
    duplicate_check = next(index for index, call in enumerate(calls) if "GROUP BY number" in call)
    restore = next(index for index, call in enumerate(calls) if "pg_restore" in call)
    cleanup = [
        index
        for index, call in enumerate(calls)
        if "DROP DATABASE IF EXISTS crm_restore_test" in call
    ]

    assert "-d crm_restore_test" in calls[duplicate_check]
    assert restore < duplicate_check < cleanup[-1]
