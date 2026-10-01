#!/usr/bin/env python3
"""Собирает «паспорт проекта» (docs/SNAPSHOT.md) прямо из кода.

Зачем это нужно
---------------
Мастер-промт для нового агента не должен содержать фактов о проекте: факты
устаревают после каждой правки, и их приходится переписывать руками. Поэтому
промт ссылается на `docs/SNAPSHOT.md`, а этот файл собирает машина — соврать
он не может, потому что читает сам код.

Как пользоваться
----------------
    python scripts/snapshot.py            # пересобрать docs/SNAPSHOT.md
    python scripts/snapshot.py --check    # проверить, что файл не протух (для CI)

Правила, которые делают проверку в CI осмысленной
-------------------------------------------------
* Только стандартная библиотека: скрипт обязан работать в любой джобе CI.
* Никакой изменчивой информации (хеши коммитов, даты, версия на проде):
  иначе файл устаревал бы при каждом коммите и проверка всегда была бы красной.
  Всё изменчивое агент узнаёт командами git — так написано в промте.
* Разбор исходников — простыми регулярными выражениями, без импорта
  приложения: импорт потребовал бы установленных зависимостей.
"""

from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "docs" / "SNAPSHOT.md"


# --- маленькие помощники ----------------------------------------------------


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def docstring_of(path: Path) -> str:
    """Первая строка docstring модуля — короткое описание файла."""
    try:
        tree = ast.parse(read(path))
    except SyntaxError:
        return ""
    doc = ast.get_docstring(tree) or ""
    return doc.strip().split("\n", 1)[0].rstrip(".")


def first_comment(path: Path) -> str:
    """Первая осмысленная строка комментария — описание для TS-файлов."""
    for line in read(path).splitlines():
        stripped = line.strip()
        if stripped.startswith(("//", "/**", "*")) and len(stripped) > 4:
            return stripped.lstrip("/*").strip()
        if stripped and not stripped.startswith(("/*", "import")):
            break
    return ""


# --- сборщики разделов ------------------------------------------------------


def backend_routers() -> list[tuple[str, str, int]]:
    """Роутеры HTTP-слоя: имя файла, префикс адресов, сколько ручек."""
    rows: list[tuple[str, str, int]] = []
    for path in sorted((ROOT / "backend/app/api/v1").glob("*.py")):
        if path.name in {"__init__.py", "router.py"}:
            continue
        text = read(path)
        prefixes = re.findall(r'APIRouter\([^)]*prefix="([^"]+)"', text)
        handlers = len(re.findall(r"@\w*router\.(get|post|patch|put|delete)\(", text))
        rows.append((path.stem, ", ".join(prefixes) or "—", handlers))
    return rows


def backend_services() -> list[tuple[str, str]]:
    """Сервисы: файл и первая строка его docstring."""
    folder = ROOT / "backend/app/services"
    return [
        (path.stem, docstring_of(path))
        for path in sorted(folder.glob("*.py"))
        if path.name != "__init__.py"
    ]


def models() -> list[tuple[str, str]]:
    """Модели SQLAlchemy: класс и имя таблицы."""
    rows: list[tuple[str, str]] = []
    for path in sorted((ROOT / "backend/app/models").glob("*.py")):
        text = read(path)
        for cls, table in re.findall(
            r"class\s+(\w+)\s*\([^)]*Base[^)]*\):.*?__tablename__\s*=\s*\"(\w+)\"",
            text,
            re.DOTALL,
        ):
            rows.append((cls, table))
    return sorted(rows)


def migrations() -> tuple[int, str]:
    """Сколько миграций и какая последняя в цепочке (head)."""
    folder = ROOT / "backend/alembic/versions"
    files = sorted(folder.glob("*.py"))
    revisions: dict[str, str] = {}
    downs: set[str] = set()
    for path in files:
        text = read(path)
        rev = re.search(r'^revision:\s*str\s*=\s*"([^"]+)"', text, re.M)
        down = re.search(r'^down_revision:\s*str\s*\|\s*None\s*=\s*"([^"]+)"', text, re.M)
        if rev:
            title = (read(path).lstrip('"').split("\n", 1)[0]).strip().strip('"')
            revisions[rev.group(1)] = title
        if down:
            downs.add(down.group(1))
    heads = [rev for rev in revisions if rev not in downs]
    head = f"{heads[0]} — {revisions[heads[0]]}" if len(heads) == 1 else ", ".join(heads)
    return len(files), head


def celery_schedule() -> list[tuple[str, str]]:
    """Фоновые задачи и расписание."""
    text = read(ROOT / "backend/app/worker/celery_app.py")
    block = re.search(r"beat_schedule\s*=\s*\{(.*?)\n\}", text, re.DOTALL)
    if not block:
        return []
    rows: list[tuple[str, str]] = []
    for task, schedule in re.findall(
        r'"task":\s*"([^"]+)".*?"schedule":\s*(crontab\([^)]*\))', block.group(1), re.DOTALL
    ):
        rows.append((task.rsplit(".", 1)[-1], schedule))
    return rows


def frontend_pages() -> list[tuple[str, list[str]]]:
    """Разделы интерфейса: папка features и страницы внутри."""
    rows: list[tuple[str, list[str]]] = []
    folder = ROOT / "frontend/src/features"
    for feature in sorted(p for p in folder.iterdir() if p.is_dir()):
        pages = sorted(
            p.stem
            for p in feature.glob("*.tsx")
            if p.stem.endswith("Page") and ".test" not in p.name
        )
        rows.append((feature.name, pages))
    return rows


def tests_count() -> tuple[int, int, list[str]]:
    """Сколько тестов в бэкенде и фронтенде + список сценарных тестов."""
    backend = sum(
        len(re.findall(r"^\s*(?:async )?def test_", read(p), re.M))
        for p in (ROOT / "backend/tests").rglob("test_*.py")
    )
    frontend_files = list((ROOT / "frontend/src").rglob("*.test.ts")) + list(
        (ROOT / "frontend/src").rglob("*.test.tsx")
    )
    frontend = sum(len(re.findall(r"^\s*it\(", read(p), re.M)) for p in frontend_files)
    flows = sorted(
        str(p.relative_to(ROOT)) for p in frontend_files if p.name.endswith("-flow.test.tsx")
    )
    return backend, frontend, flows


def ci_jobs() -> list[tuple[str, list[str]]]:
    """Джобы и шаги проверок (разбор YAML без зависимостей)."""
    text = read(ROOT / ".github/workflows/checks.yml")
    jobs: list[tuple[str, list[str]]] = []
    current: tuple[str, list[str]] | None = None
    for line in text.splitlines():
        job_name = re.match(r"^    name:\s*(.+)$", line)
        step_name = re.match(r"^      - name:\s*(.+)$", line)
        if job_name:
            current = (job_name.group(1).strip(), [])
            jobs.append(current)
        elif step_name and current is not None:
            current[1].append(step_name.group(1).strip())
    return jobs


def docker_services() -> list[str]:
    """Контейнеры стека."""
    text = read(ROOT / "docker-compose.yml")
    block = text.split("\nservices:", 1)[-1].split("\nvolumes:", 1)[0]
    return re.findall(r"^  (\w[\w-]*):", block, re.M)


# --- сборка документа -------------------------------------------------------


def build() -> str:
    routers = backend_routers()
    services = backend_services()
    model_rows = models()
    migration_count, head = migrations()
    schedule = celery_schedule()
    pages = frontend_pages()
    backend_tests, frontend_tests, flows = tests_count()
    jobs = ci_jobs()
    containers = docker_services()

    lines: list[str] = []
    add = lines.append

    add("# Паспорт проекта (собирается автоматически)")
    add("")
    add("> **Этот файл не редактируют руками.** Его собирает `scripts/snapshot.py`")
    add("> прямо из кода, а GitHub Actions проверяет, что он не протух.")
    add("> Пересобрать: `python scripts/snapshot.py`")
    add(">")
    add("> Здесь только то, что машина может прочитать в репозитории: состав кода,")
    add("> маршруты, таблицы, задачи, тесты, проверки. Изменчивое — версия на проде,")
    add("> последние коммиты, дата — намеренно НЕ включено: это агент узнаёт")
    add("> командами `git`. Смысл решений и договорённости — в `PROJECT.md`,")
    add("> `STATUS.md` и `HANDOVER.md`.")
    add("")

    add("## Из чего состоит система")
    add("")
    add(f"Контейнеры стека ({len(containers)}): " + " · ".join(f"`{c}`" for c in containers) + ".")
    add("")

    add("## Бэкенд: HTTP-слой (`backend/app/api/v1/`)")
    add("")
    add("Роутеры принимают запрос и вызывают сервис — бизнес-логики здесь нет.")
    add("")
    add("| Файл | Адреса начинаются с | Ручек |")
    add("|---|---|---|")
    for name, prefix, count in routers:
        add(f"| `{name}.py` | `{prefix}` | {count} |")
    add("")

    add("## Бэкенд: слой логики (`backend/app/services/`)")
    add("")
    add("Вся работа с базой, проверки прав, записи в ленту, файлы. Новая логика — сюда.")
    add("")
    add("| Файл | Что внутри |")
    add("|---|---|")
    for name, doc in services:
        add(f"| `{name}.py` | {doc or '—'} |")
    add("")

    add("## Данные")
    add("")
    add("| Модель | Таблица |")
    add("|---|---|")
    for cls, table in model_rows:
        add(f"| `{cls}` | `{table}` |")
    add("")
    add(f"Миграций: **{migration_count}**, последняя в цепочке — `{head}`.")
    add("")

    add("## Фоновые задачи (Celery beat)")
    add("")
    add("| Задача | Расписание |")
    add("|---|---|")
    for task, when in schedule:
        add(f"| `{task}` | `{when}` |")
    add("")

    add("## Интерфейс (`frontend/src/features/`)")
    add("")
    add("| Раздел | Страницы |")
    add("|---|---|")
    for feature, feature_pages in pages:
        add(f"| `{feature}` | {', '.join(f'`{p}`' for p in feature_pages) or '—'} |")
    add("")

    add("## Тесты")
    add("")
    add(f"- бэкенд (pytest): **{backend_tests}** тест-функций")
    add(f"- фронтенд (vitest): **{frontend_tests}** тестов")
    if flows:
        add("- сценарные (подменяется только сеть, остальное настоящее):")
        for flow in flows:
            add(f"  - `{flow}`")
    add("")
    add("Считаются объявления в коде; при параметризации фактических прогонов больше.")
    add("")

    add("## Что проверяет CI при каждой отправке")
    add("")
    for job, steps in jobs:
        add(f"**{job}**")
        add("")
        for step in steps:
            add(f"- {step}")
        add("")

    add("---")
    add("")
    add("Пересобрать этот файл после правок: `python scripts/snapshot.py`")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Паспорт проекта из кода")
    parser.add_argument(
        "--check",
        action="store_true",
        help="не записывать файл, а проверить, что он совпадает с кодом",
    )
    args = parser.parse_args()

    fresh = build()
    current = read(OUT)

    if args.check:
        if current == fresh:
            print("Паспорт проекта актуален.")
            return 0
        print(
            "Паспорт проекта устарел: docs/SNAPSHOT.md не совпадает с кодом.\n"
            "Выполните `python scripts/snapshot.py` и закоммитьте изменения.",
            file=sys.stderr,
        )
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(fresh, encoding="utf-8")
    print(f"Записан {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
