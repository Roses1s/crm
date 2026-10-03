"""Подготовка строки поиска для SQL-оператора LIKE/ILIKE.

В шаблоне LIKE символы `%` и `_` — служебные: «что угодно» и «любой один
символ». Если подставить пользовательский ввод как есть, запрос «50%» найдёт
вообще всё, что начинается с «50», а запрос «_» — все записи подряд. Поэтому
служебные символы экранируются, а в сам запрос передаётся `escape="\\"`.
"""

from __future__ import annotations

LIKE_ESCAPE = "\\"


def like_pattern(raw: str) -> str:
    """Возвращает безопасный шаблон `%текст%` для ILIKE."""
    escaped = (
        raw.strip()
        .replace(LIKE_ESCAPE, LIKE_ESCAPE * 2)
        .replace("%", f"{LIKE_ESCAPE}%")
        .replace("_", f"{LIKE_ESCAPE}_")
    )
    return f"%{escaped}%"
