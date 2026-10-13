"""Бизнес-логика вложений лидов и заявок.

Файлы лежат на диске в томе (`ATTACHMENTS_DIR`), а метаданные — в базе.
На диск попадает обезличенное имя `<uuid>.<расширение>`: так исключены
совпадения имён и подстановка пути вроде `../../etc/passwd`. Миниатюра для
чаттера создаётся рядом как производный кеш `<uuid>.thumbnail.webp` и может
быть в любой момент построена заново из оригинала.

База, резервные копии и вложения живут на одном разделе, поэтому перед
записью проверяется свободное место (`MIN_FREE_DISK_MB`): переполненный диск
останавливает PostgreSQL. Файлы, оставшиеся без записи в базе, раз в неделю
убирает задача `cleanup_orphan_files`.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import threading
import uuid
import warnings
import weakref
from contextlib import suppress
from io import BytesIO
from pathlib import Path

from fastapi import UploadFile, status
from PIL import Image, ImageOps, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.attachment_paths import thumbnail_path
from app.core.config import settings
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.logging import get_logger
from app.models.shipment import Shipment
from app.models.timeline import Attachment, TimelineEntry
from app.models.user import Role, User
from app.services.leads import get_editable_lead, get_lead_or_404

log = get_logger(__name__)

CHUNK = 1024 * 1024  # файл читаем кусками по мегабайту, а не целиком в память

# Разрешённые расширения — белый список. Сознательно без .svg и .htm(l):
# браузер разбирает их как разметку, и открытие вложения обернулось бы XSS
# на домене сервиса. Заодно отсекаются исполняемые и прочие файлы, которым
# в CRM делать нечего.
ALLOWED_EXTENSIONS: dict[str, str] = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".zip": "application/zip",
    ".rar": "application/vnd.rar",
    ".7z": "application/x-7z-compressed",
}

# Только эти типы браузеру разрешено открывать прямо в окне; всё остальное
# всегда уходит скачиванием, чтобы содержимое не выполнилось как страница.
INLINE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"}
IMAGE_TYPES = frozenset({"image/png", "image/jpeg", "image/gif", "image/webp"})
THUMBNAIL_CONTENT_TYPE = "image/webp"
THUMBNAIL_MAX_EDGE = 480
# Предел пикселей: около 72 МБ RGB или 96 МБ RGBA в развёрнутом виде.
# Порог защищает API от «архивов» под видом картинок и при этом оставляет
# запас для обычных фотографий с телефона.
THUMBNAIL_MAX_PIXELS = 24_000_000
THUMBNAIL_QUALITY = 82
# Декодирование большой картинки заметно нагружает память, поэтому внутри
# одного процесса worker изображения одновременно не обрабатываются.
_THUMBNAIL_SLOT = threading.BoundedSemaphore(1)

# В каждый процесс gunicorn одновременно пишется не больше одного файла.
# Асинхронный семафор ждёт очереди, не занимая поток выполнения.
_UPLOAD_SLOTS: weakref.WeakKeyDictionary[asyncio.AbstractEventLoop, asyncio.Semaphore] = (
    weakref.WeakKeyDictionary()
)
_UPLOAD_SLOTS_LOCK = threading.Lock()
try:
    _UPLOAD_WORKERS = max(1, int(os.getenv("GUNICORN_WORKERS", "3")))
except ValueError:
    _UPLOAD_WORKERS = 3


def _upload_slot() -> asyncio.Semaphore:
    """Семафор на event loop: тесты могут запускать разные loop в одном процессе."""
    loop = asyncio.get_running_loop()
    with _UPLOAD_SLOTS_LOCK:
        slot = _UPLOAD_SLOTS.get(loop)
        if slot is None:
            slot = asyncio.Semaphore(1)
            _UPLOAD_SLOTS[loop] = slot
        return slot


def storage_root() -> Path:
    return Path(settings.attachments_dir)


# --- Запись файла на диск ---


def _checked_suffix(original: str) -> str:
    """Проверяет расширение по белому списку и возвращает его в нижнем регистре."""
    suffix = Path(original).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise AppError(
            f"Тип файла «{suffix or 'без расширения'}» не поддерживается. "
            f"Разрешены: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
            code="unsupported_file_type",
        )
    return suffix


def _free_disk_mb(path: Path) -> int:
    """Сколько мегабайт свободно на том же разделе, что и каталог вложений."""
    probe = path if path.exists() else storage_root()
    probe.mkdir(parents=True, exist_ok=True)
    return int(shutil.disk_usage(probe).free // (1024 * 1024))


async def _ensure_disk_space(target: Path) -> None:
    """Не даёт загрузкой файлов добить диск до нуля.

    На сервере база, резервные копии и вложения живут на одном разделе в
    15 ГБ. Переполнение диска останавливает PostgreSQL — это худшее, что
    может случиться, поэтому последний гигабайт не отдаём под загрузки.
    """
    free_mb = await run_in_threadpool(_free_disk_mb, target.parent)
    required = settings.min_free_disk_mb + settings.max_upload_mb * _UPLOAD_WORKERS
    if free_mb < required:
        raise AppError(
            "На сервере заканчивается место на диске — загрузка файлов временно "
            f"недоступна (свободно {free_mb} МБ). Сообщите администратору.",
            code="low_disk_space",
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
        )


async def _save_upload(upload: UploadFile, target: Path) -> int:
    """Пишет файл на диск в отдельном потоке, следя за лимитом. Возвращает размер.

    Запись на диск — блокирующая операция. Выносим её в пул потоков через
    ``run_in_threadpool``, чтобы загрузка большого файла не «замораживала» весь
    асинхронный воркер: пока один пользователь заливает документ, остальные
    продолжают получать ответы.
    """
    limit = settings.max_upload_mb * 1024 * 1024
    written = 0
    await run_in_threadpool(target.parent.mkdir, parents=True, exist_ok=True)
    await _ensure_disk_space(target)
    out = await run_in_threadpool(target.open, "wb")
    try:
        while chunk := await upload.read(CHUNK):
            written += len(chunk)
            if written > limit:
                raise AppError(
                    f"Файл больше {settings.max_upload_mb} МБ",
                    code="file_too_large",
                    status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                )
            await run_in_threadpool(out.write, chunk)
    except BaseException:
        # При любом сбое (превышен лимит, оборвалось соединение) недописанный
        # файл на диске не остаётся: он не виден в базе и стал бы мусором.
        await run_in_threadpool(out.close)
        await run_in_threadpool(target.unlink, missing_ok=True)
        raise
    await run_in_threadpool(out.close)
    return written


async def _store_upload(file: UploadFile, relative_dir: Path) -> tuple[str, str, int, Path]:
    """Проверяет тип, сохраняет файл и возвращает имя, тип, размер и путь.

    Общая часть загрузки для лидов и заявок: различается только папка,
    остальное — белый список расширений, лимит размера и обезличенное имя.
    """
    original = Path(file.filename or "file").name  # путь из имени клиента отбрасываем целиком: нужен только сам файл
    suffix = _checked_suffix(original)
    target = storage_root() / relative_dir / f"{uuid.uuid4().hex}{suffix}"
    # Одна активная загрузка на процесс: семафор не блокирует event loop,
    # а суммарный резерв по всем процессам не даёт загрузкам устроить
    # гонку за диском.
    slot = _upload_slot()
    await slot.acquire()
    try:
        size = await _save_upload(file, target)
    finally:
        slot.release()
    return original[:255], ALLOWED_EXTENSIONS[suffix], size, target


def _thumbnail_is_fresh(original: Path, thumbnail: Path) -> bool:
    """Не пересчитывает миниатюру, пока оригинал не менялся."""
    try:
        return (
            thumbnail.is_file()
            and thumbnail.stat().st_size > 0
            and thumbnail.stat().st_mtime_ns >= original.stat().st_mtime_ns
        )
    except FileNotFoundError:
        return False


def _render_thumbnail(original: Path, target: Path) -> None:
    """Создаёт небольшую WebP-копию, не меняя загруженный оригинал."""
    try:
        with warnings.catch_warnings():
            # Изображение сверх предела пикселей отклоняем понятной ошибкой:
            # позволять Pillow разворачивать его в памяти без ограничений
            # нельзя.
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(original) as source:
                if source.format not in {"PNG", "JPEG", "GIF", "WEBP"}:
                    raise AppError(
                        "Файл не распознан как поддерживаемое изображение",
                        code="invalid_image",
                        status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    )
                if source.width * source.height > THUMBNAIL_MAX_PIXELS:
                    raise AppError(
                        "Изображение слишком большое для миниатюры",
                        code="image_too_large",
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                    )

                image = ImageOps.exif_transpose(source)
                try:
                    # Миниатюру GIF делаем из первого кадра; сама анимация
                    # не изменяется и доступна при открытии полного файла.
                    image.thumbnail(
                        (THUMBNAIL_MAX_EDGE, THUMBNAIL_MAX_EDGE), Image.Resampling.LANCZOS
                    )
                    has_alpha = "A" in image.getbands() or "transparency" in image.info
                    converted = image.convert("RGBA" if has_alpha else "RGB")
                    try:
                        buffer = BytesIO()
                        converted.save(
                            buffer,
                            format="WEBP",
                            quality=THUMBNAIL_QUALITY,
                            method=4,
                        )
                        content = buffer.getvalue()
                    finally:
                        converted.close()
                finally:
                    if image is not source:
                        image.close()
    except FileNotFoundError:
        raise
    except AppError:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise AppError(
            "Изображение слишком большое для миниатюры",
            code="image_too_large",
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
        ) from exc
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise AppError(
            "Файл повреждён или не является изображением",
            code="invalid_image",
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
        ) from exc

    temporary = target.with_name(f".{target.name}.{uuid.uuid4().hex}.tmp")
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary.write_bytes(content)
        temporary.replace(target)
    except OSError as exc:
        with suppress(OSError):
            temporary.unlink(missing_ok=True)
        raise AppError(
            "Не удалось сохранить миниатюру на сервере",
            code="thumbnail_storage_failed",
            status_code=status.HTTP_507_INSUFFICIENT_STORAGE,
        ) from exc


def _ensure_thumbnail(original: Path, target: Path) -> None:
    """Проверяет кеш и атомарно пересоздаёт устаревшую миниатюру."""
    with _THUMBNAIL_SLOT:
        if not _thumbnail_is_fresh(original, target):
            _render_thumbnail(original, target)


# --- Вложения лида ---


async def list_lead_attachments(
    session: AsyncSession, user: User, lead_id: int
) -> list[Attachment]:
    # Правило чтения повторяет карточку: вложения проигранного лида видны
    # всем сотрудникам, как и сам лид.
    await get_lead_or_404(session, lead_id, user, allow_lost=True)
    stmt = (
        select(Attachment)
        # Файлы заявки в карточке лида не показываем: их место только на
        # самой заявке (решение владельца).
        .where(Attachment.lead_id == lead_id, Attachment.shipment_id.is_(None))
        .order_by(Attachment.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


async def upload_lead_attachment(
    session: AsyncSession,
    user: User,
    lead_id: int,
    file: UploadFile,
    entry_id: int | None = None,
) -> Attachment:
    await get_editable_lead(session, lead_id, user)
    if entry_id is not None:
        entry = await session.get(TimelineEntry, entry_id)
        if entry is None or entry.lead_id != lead_id or entry.shipment_id is not None:
            raise NotFoundError(f"Запись ленты {entry_id} не найдена")

    # Тип файла определяем по расширению, а не по заголовку клиента:
    # заголовок подделывается одной строкой, расширению мы доверяем после
    # сверки с белым списком.
    name, content_type, size, target = await _store_upload(file, Path(str(lead_id)))

    attachment = Attachment(
        lead_id=lead_id,
        entry_id=entry_id,
        uploaded_by_id=user.id,
        name=name,
        size=size,
        content_type=content_type,
        storage_path=str(target),
    )
    session.add(attachment)
    try:
        await get_editable_lead(session, lead_id, user, for_update=True)
        await session.commit()
    except BaseException:
        # Файл к этому моменту уже на диске; если проверка или транзакция
        # упадёт, удаляем именно его, не трогая остальные файлы лида.
        await run_in_threadpool(target.unlink, missing_ok=True)
        raise
    await session.refresh(attachment)

    log.info("attachment.uploaded", lead_id=lead_id, size=size, by=user.id)
    return attachment


# --- Вложения заявки ---


async def _shipment_or_404(
    session: AsyncSession,
    user: User,
    shipment_id: int,
    *,
    allow_lost: bool = False,
    for_write: bool = False,
    lock_for_write: bool = False,
) -> Shipment:
    shipment = await session.get(Shipment, shipment_id)
    if shipment is None:
        raise NotFoundError(f"Заявка {shipment_id} не найдена")
    # Пока связанный лид проигран, запись во вложения запрещена: проигранная
    # карточка во всей системе доступна только для чтения.
    if for_write:
        await get_editable_lead(session, shipment.lead_id, user, for_update=lock_for_write)
    else:
        await get_lead_or_404(session, shipment.lead_id, user, allow_lost=allow_lost)
    return shipment


async def list_shipment_attachments(
    session: AsyncSession, user: User, shipment_id: int
) -> list[Attachment]:
    await _shipment_or_404(session, user, shipment_id, allow_lost=True)
    stmt = (
        select(Attachment)
        .where(Attachment.shipment_id == shipment_id)
        .order_by(Attachment.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


async def upload_shipment_attachment(
    session: AsyncSession,
    user: User,
    shipment_id: int,
    file: UploadFile,
    entry_id: int | None = None,
) -> Attachment:
    shipment = await _shipment_or_404(session, user, shipment_id, for_write=True)

    if entry_id is not None:
        entry = await session.get(TimelineEntry, entry_id)
        if entry is None or entry.shipment_id != shipment_id:
            raise NotFoundError(f"Запись {entry_id} не найдена")

    # Файлы заявки храним в отдельной папке: смешивать их с файлами самого
    # лида нельзя, у них разные карточки и сроки жизни на экране.
    name, content_type, size, target = await _store_upload(
        file, Path("shipments") / str(shipment_id)
    )

    attachment = Attachment(
        # lead_id у файла заявки заполняем от самой заявки: файл учитывается
        # в объёме лида и удаляется вместе с ним, а не остаётся сиротой.
        lead_id=shipment.lead_id,
        shipment_id=shipment_id,
        entry_id=entry_id,
        uploaded_by_id=user.id,
        name=name,
        size=size,
        content_type=content_type,
        storage_path=str(target),
    )
    session.add(attachment)
    try:
        await get_editable_lead(session, shipment.lead_id, user, for_update=True)
        await session.commit()
    except BaseException:
        await run_in_threadpool(target.unlink, missing_ok=True)
        raise
    await session.refresh(attachment)

    log.info("attachment.uploaded", shipment_id=shipment_id, size=size, by=user.id)
    return attachment


# --- Скачивание и удаление ---


async def get_for_download(
    session: AsyncSession, user: User, attachment_id: int
) -> tuple[Attachment, Path, str]:
    """Возвращает вложение, путь на диске и способ показа (inline/attachment)."""
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Вложение {attachment_id} не найдено")
    # Правило чтения повторяет карточку: файл проигранного лида можно
    # открыть, как и сам лид.
    await get_lead_or_404(session, attachment.lead_id, user, allow_lost=True)

    path = Path(attachment.storage_path)
    if not path.is_file():
        raise NotFoundError("Файл не найден на диске — возможно, он был удалён")

    # В окне показываем только картинки и PDF; остальные типы только
    # скачиваются, чтобы исполняемый или HTML-файл не выполнился в браузере
    # от имени нашего домена.
    disposition = "inline" if attachment.content_type in INLINE_TYPES else "attachment"
    return attachment, path, disposition


async def get_thumbnail(
    session: AsyncSession, user: User, attachment_id: int
) -> tuple[Attachment, Path]:
    """Проверяет те же права чтения, что и оригинал, и возвращает его миниатюру."""
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Вложение {attachment_id} не найдено")
    # Доступ повторяет get_for_download: тот же лид и тот же режим чтения
    # проигранной карточки; миниатюра не должна быть лазейкой мимо проверки.
    await get_lead_or_404(session, attachment.lead_id, user, allow_lost=True)

    if attachment.content_type not in IMAGE_TYPES:
        raise NotFoundError("Для этого вложения миниатюра не предусмотрена")

    original = Path(attachment.storage_path)
    if not original.is_file():
        raise NotFoundError("Файл не найден на диске — возможно, он был удалён")
    target = thumbnail_path(original)
    try:
        await run_in_threadpool(_ensure_thumbnail, original, target)
    except FileNotFoundError as exc:
        raise NotFoundError("Файл не найден на диске — возможно, он был удалён") from exc
    return attachment, target


async def delete_attachment(session: AsyncSession, user: User, attachment_id: int) -> None:
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Вложение {attachment_id} не найдено")
    # Удаление вложения — операция записи даже у заявки проигранного лида:
    # режим «только чтение» здесь не действует.
    await get_editable_lead(session, attachment.lead_id, user, for_update=True)

    # Свой файл удаляет его автор; чужой — только администратор.
    if attachment.uploaded_by_id != user.id and user.role != Role.admin:
        raise PermissionDeniedError("Удалить чужое вложение может только администратор")

    # Порядок — сначала запись в базе, потом файл: при обратной
    # последовательности упавшая транзакция оставила бы запись о файле,
    # которого уже нет. Удаление с диска уводим в пул потоков, как и
    # остальную блокирующую работу с файлами.
    path = Path(attachment.storage_path)
    await session.delete(attachment)
    await session.commit()
    await run_in_threadpool(path.unlink, missing_ok=True)
    await run_in_threadpool(thumbnail_path(path).unlink, missing_ok=True)
    log.info("attachment.deleted", attachment_id=attachment_id, by=user.id)


# --- Место на диске ---


def _scan_disk_usage() -> dict[str, int]:
    """Синхронный обход каталога вложений — вызывается в пуле потоков."""
    root = storage_root()
    if not root.exists():
        return {"files": 0, "bytes": 0, "free_bytes": 0}
    files = 0
    total_bytes = 0
    for path in root.rglob("*"):
        try:
            if not path.is_file():
                continue
            total_bytes += path.stat().st_size
            files += 1
        except OSError:
            # Вложение могло исчезнуть прямо во время обхода или оказаться
            # недоступным: обход не должен падать из-за одного файла.
            continue
    return {
        "files": files,
        "bytes": total_bytes,
        "free_bytes": shutil.disk_usage(root).free,
    }


async def disk_usage() -> dict[str, int]:
    """Сколько места занимают вложения — показывается в разделе «Безопасность».

    Обход всех файлов на диске блокирующий, поэтому выполняется в пуле потоков,
    чтобы не задерживать остальные запросы.
    """
    return await run_in_threadpool(_scan_disk_usage)
