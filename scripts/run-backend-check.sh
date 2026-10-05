#!/usr/bin/env bash
# Запускает python-модуль бэкенда (mypy, pytest, ...) тем же интерпретатором,
# что и обычный `pip install -e ".[dev]"` у разработчика — не завязано на
# конкретное имя/путь venv, которое может отличаться (.venv, venv, uv, pyenv).
#
# Используется из .pre-commit-config.yaml вместо жёстко прописанного
# backend/.venv/bin/mypy — тот ломался у любого, кто назвал каталог venv
# иначе или активировал окружение менеджером вроде uv/pyenv.
#
# Порядок поиска интерпретатора: уже активное окружение (VIRTUAL_ENV) ->
# backend/.venv -> обычный python3 на PATH (на свой страх и риск — там
# должны быть установлены dev-зависимости).
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../backend"

if [ -n "${VIRTUAL_ENV:-}" ] && [ -x "${VIRTUAL_ENV}/bin/python" ]; then
  python_bin="${VIRTUAL_ENV}/bin/python"
elif [ -x ".venv/bin/python" ]; then
  python_bin=".venv/bin/python"
else
  python_bin="$(command -v python3)"
fi

exec "$python_bin" -m "$@"
