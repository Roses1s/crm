"""Пути для производных файлов вложений.

Миниатюры можно пересоздать из оригиналов, поэтому они хранятся рядом с
файлом и имеют отдельное имя, которое не совпадает с расширением загрузки.
"""

from __future__ import annotations

from pathlib import Path

THUMBNAIL_SUFFIX = ".thumbnail.webp"


def thumbnail_path(original: Path) -> Path:
    """Путь кешированной WebP-миниатюры для оригинального вложения."""
    return original.with_name(f"{original.stem}{THUMBNAIL_SUFFIX}")


def is_thumbnail_path(path: Path) -> bool:
    """Отличает производные миниатюры от загруженных пользователем файлов."""
    return path.name.endswith(THUMBNAIL_SUFFIX)
