"""Бизнес-логика вложений лидов и заявок.

Файлы лежат на диске в томе (`ATTACHMENTS_DIR`), а метаданные — в базе.
На диск попадает обезличенное имя `<uuid>.<расширение>`: так исключены
совпадения имён и подстановка пути вроде `../../etc/passwd`.
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import settings
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.logging import get_logger
from app.models.shipment import Shipment
from app.models.timeline import Attachment, TimelineEntry
from app.models.user import Role, User
from app.services.leads import get_lead_or_404

log = get_logger(__name__)

CHUNK = 1024 * 1024  # читаем файл мегабайтными кусками, не целиком в память

# Белый список расширений. Сознательно без .svg и .htm(l): такие файлы браузер
# разбирает как разметку, и открытие вложения могло бы стать XSS на домене.
# Заодно отсекаются .exe и прочее, чего в CRM делать нечего.
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

# Эти типы браузер может открыть прямо в окне — остальные всегда скачиваются.
INLINE_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp", "application/pdf"}


def storage_root() -> Path:
    return Path(settings.attachments_dir)


# --- запись файла на диск ---------------------------------------------------


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
    required = settings.min_free_disk_mb + settings.max_upload_mb
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
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
            await run_in_threadpool(out.write, chunk)
    except BaseException:
        # Любой сбой (превышен лимит, обрыв соединения) — недописанный файл
        # не должен остаться на диске.
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
    original = Path(file.filename or "file").name  # отбрасываем путь целиком
    suffix = _checked_suffix(original)
    target = storage_root() / relative_dir / f"{uuid.uuid4().hex}{suffix}"
    size = await _save_upload(file, target)
    return original[:255], ALLOWED_EXTENSIONS[suffix], size, target


# --- вложения лида ----------------------------------------------------------


async def list_lead_attachments(
    session: AsyncSession, user: User, lead_id: int
) -> list[Attachment]:
    # Чтение — вложения проигранного лида видны всем, как и сам лид.
    await get_lead_or_404(session, lead_id, user, allow_lost=True)
    stmt = (
        select(Attachment)
        # Файлы заявок показываются только на самой заявке — решение владельца.
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
    await get_lead_or_404(session, lead_id, user)
    if entry_id is not None:
        entry = await session.get(TimelineEntry, entry_id)
        if entry is None or entry.lead_id != lead_id:
            raise NotFoundError(f"Запись ленты {entry_id} не найдена")

    # Тип берём из расширения, а не из заголовка клиента: заголовку верить нельзя.
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
    await session.commit()
    await session.refresh(attachment)

    log.info("attachment.uploaded", lead_id=lead_id, size=size, by=user.id)
    return attachment


# --- вложения заявки --------------------------------------------------------


async def _shipment_or_404(
    session: AsyncSession, user: User, shipment_id: int, *, allow_lost: bool = False
) -> Shipment:
    shipment = await session.get(Shipment, shipment_id)
    if shipment is None:
        raise NotFoundError(f"Заявка {shipment_id} не найдена")
    # Документы заявки доступны тому же кругу, что и сама заявка.
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
    shipment = await _shipment_or_404(session, user, shipment_id)

    if entry_id is not None:
        entry = await session.get(TimelineEntry, entry_id)
        if entry is None or entry.shipment_id != shipment_id:
            raise NotFoundError(f"Запись {entry_id} не найдена")

    # Файлы заявки лежат в отдельной папке, чтобы не смешиваться с файлами лида.
    name, content_type, size, target = await _store_upload(
        file, Path("shipments") / str(shipment_id)
    )

    attachment = Attachment(
        # lead_id заполняем от заявки: так файл не потеряется при подсчёте
        # объёма по лиду и удалится вместе с ним.
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
    await session.commit()
    await session.refresh(attachment)

    log.info("attachment.uploaded", shipment_id=shipment_id, size=size, by=user.id)
    return attachment


# --- скачивание и удаление --------------------------------------------------


async def get_for_download(
    session: AsyncSession, user: User, attachment_id: int
) -> tuple[Attachment, Path, str]:
    """Возвращает вложение, путь на диске и способ показа (inline/attachment)."""
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Вложение {attachment_id} не найдено")
    # Чтение — файл проигранного лида можно открыть, как и саму карточку.
    await get_lead_or_404(session, attachment.lead_id, user, allow_lost=True)

    path = Path(attachment.storage_path)
    if not path.is_file():
        raise NotFoundError("Файл не найден на диске — возможно, он был удалён")

    # Картинки и PDF можно показать в окне, остальное — только скачать:
    # так исполняемый или html-файл не выполнится в браузере.
    disposition = "inline" if attachment.content_type in INLINE_TYPES else "attachment"
    return attachment, path, disposition


async def delete_attachment(session: AsyncSession, user: User, attachment_id: int) -> None:
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Вложение {attachment_id} не найдено")
    await get_lead_or_404(session, attachment.lead_id, user)

    # Свой файл удаляет автор, чужой — только администратор.
    if attachment.uploaded_by_id != user.id and user.role != Role.admin:
        raise PermissionDeniedError("Удалить чужое вложение может только администратор")

    # Сначала запись, потом файл: если бы транзакция не прошла после удаления
    # файла, запись осталась бы в базе, а файла уже не было. Удаление с диска
    # выносим в пул потоков, как и остальную работу с файлами.
    path = Path(attachment.storage_path)
    await session.delete(attachment)
    await session.commit()
    await run_in_threadpool(path.unlink, missing_ok=True)
    log.info("attachment.deleted", attachment_id=attachment_id, by=user.id)


# --- место на диске ---------------------------------------------------------


def _scan_disk_usage() -> dict[str, int]:
    """Синхронный обход каталога вложений — вызывается в пуле потоков."""
    root = storage_root()
    if not root.exists():
        return {"files": 0, "bytes": 0, "free_bytes": 0}
    files = [p for p in root.rglob("*") if p.is_file()]
    return {
        "files": len(files),
        "bytes": sum(p.stat().st_size for p in files),
        "free_bytes": shutil.disk_usage(root).free,
    }


async def disk_usage() -> dict[str, int]:
    """Сколько места занимают вложения — показывается в разделе «Безопасность».

    Обход всех файлов на диске блокирующий, поэтому выполняется в пуле потоков,
    чтобы не задерживать остальные запросы.
    """
    return await run_in_threadpool(_scan_disk_usage)
