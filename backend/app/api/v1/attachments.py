"""Вложения лидов и заявок на перевозку.

Файлы лежат на диске в томе (`ATTACHMENTS_DIR`), а метаданные — в базе.
На диск попадает обезличенное имя `<uuid>.<расширение>`: так исключены
совпадения имён и подстановка пути вроде `../../etc/passwd`.
"""

from __future__ import annotations

import shutil
import uuid
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.core.config import settings
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.logging import get_logger
from app.models.shipment import Shipment
from app.models.timeline import Attachment, TimelineEntry
from app.models.user import Role
from app.schemas.crm import AttachmentRead

router = APIRouter(prefix="/crm", tags=["crm: вложения"])
# Заявки живут вне префикса /crm, поэтому их вложениям нужен отдельный роутер.
shipment_router = APIRouter(tags=["заявки: вложения"])
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


def _storage_root() -> Path:
    return Path(settings.attachments_dir)


async def _save_upload(upload: UploadFile, target: Path) -> int:
    """Пишет файл на диск, следя за лимитом размера. Возвращает размер."""
    limit = settings.max_upload_mb * 1024 * 1024
    written = 0
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open("wb") as out:
        while chunk := await upload.read(CHUNK):
            written += len(chunk)
            if written > limit:
                out.close()
                target.unlink(missing_ok=True)
                raise AppError(
                    f"Файл больше {settings.max_upload_mb} МБ",
                    code="file_too_large",
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                )
            out.write(chunk)
    return written


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


@router.get(
    "/leads/{lead_id}/attachments",
    response_model=list[AttachmentRead],
    summary="Вложения лида",
)
async def list_attachments(lead_id: int, session: SessionDep, _: CurrentUser) -> list[Attachment]:
    stmt = (
        select(Attachment)
        # Файлы заявок показываются только на самой заявке — решение владельца.
        .where(Attachment.lead_id == lead_id, Attachment.shipment_id.is_(None))
        .order_by(Attachment.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


@router.post(
    "/leads/{lead_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Загрузить файл",
)
async def upload_attachment(
    lead_id: int,
    session: SessionDep,
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="Файл до 25 МБ")],
    entry_id: Annotated[int | None, Query(description="Привязать к записи ленты")] = None,
) -> Attachment:
    if entry_id is not None:
        entry = await session.get(TimelineEntry, entry_id)
        if entry is None or entry.lead_id != lead_id:
            raise NotFoundError(f"Запись ленты {entry_id} не найдена")

    original = Path(file.filename or "file").name  # отбрасываем путь целиком
    suffix = _checked_suffix(original)
    relative = Path(str(lead_id)) / f"{uuid.uuid4().hex}{suffix}"
    target = _storage_root() / relative

    size = await _save_upload(file, target)

    attachment = Attachment(
        lead_id=lead_id,
        entry_id=entry_id,
        uploaded_by_id=user.id,
        name=original[:255],
        size=size,
        # Тип берём из расширения, а не из заголовка клиента: заголовку верить нельзя.
        content_type=ALLOWED_EXTENSIONS[suffix],
        storage_path=str(target),
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)

    log.info("attachment.uploaded", lead_id=lead_id, size=size, by=user.id)
    return attachment


@shipment_router.get(
    "/shipments/{shipment_id}/attachments",
    response_model=list[AttachmentRead],
    summary="Вложения заявки",
)
async def list_shipment_attachments(
    shipment_id: int, session: SessionDep, _: CurrentUser
) -> list[Attachment]:
    stmt = (
        select(Attachment)
        .where(Attachment.shipment_id == shipment_id)
        .order_by(Attachment.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


@shipment_router.post(
    "/shipments/{shipment_id}/attachments",
    response_model=AttachmentRead,
    status_code=status.HTTP_201_CREATED,
    summary="Загрузить файл к заявке",
)
async def upload_shipment_attachment(
    shipment_id: int,
    session: SessionDep,
    user: CurrentUser,
    file: Annotated[UploadFile, File(description="Файл до 25 МБ")],
) -> Attachment:
    shipment = await session.get(Shipment, shipment_id)
    if shipment is None:
        raise NotFoundError(f"Заявка {shipment_id} не найдена")

    original = Path(file.filename or "file").name  # отбрасываем путь целиком
    suffix = _checked_suffix(original)
    # Файлы заявки лежат в отдельной папке, чтобы не смешиваться с файлами лида.
    relative = Path("shipments") / str(shipment_id) / f"{uuid.uuid4().hex}{suffix}"
    target = _storage_root() / relative

    size = await _save_upload(file, target)

    attachment = Attachment(
        # lead_id заполняем от заявки: так файл не потеряется при подсчёте
        # объёма по лиду и удалится вместе с ним.
        lead_id=shipment.lead_id,
        shipment_id=shipment_id,
        uploaded_by_id=user.id,
        name=original[:255],
        size=size,
        content_type=ALLOWED_EXTENSIONS[suffix],
        storage_path=str(target),
    )
    session.add(attachment)
    await session.commit()
    await session.refresh(attachment)

    log.info("attachment.uploaded", shipment_id=shipment_id, size=size, by=user.id)
    return attachment


@router.get("/attachments/{attachment_id}", summary="Скачать файл")
async def download_attachment(
    attachment_id: int, session: SessionDep, _: CurrentUser
) -> FileResponse:
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Вложение {attachment_id} не найдено")

    path = Path(attachment.storage_path)
    if not path.is_file():
        raise NotFoundError("Файл не найден на диске — возможно, он был удалён")

    # Картинки и PDF можно показать в окне, остальное — только скачать:
    # так исполняемый или html-файл не выполнится в браузере.
    disposition = "inline" if attachment.content_type in INLINE_TYPES else "attachment"
    return FileResponse(
        path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=attachment.name,
        content_disposition_type=disposition,
        headers={"X-Content-Type-Options": "nosniff"},
    )


@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить файл",
)
async def delete_attachment(attachment_id: int, session: SessionDep, user: CurrentUser) -> None:
    attachment = await session.get(Attachment, attachment_id)
    if attachment is None:
        raise NotFoundError(f"Вложение {attachment_id} не найдено")

    # Свой файл удаляет автор, чужой — только администратор.
    if attachment.uploaded_by_id != user.id and user.role != Role.admin:
        raise PermissionDeniedError("Удалить чужое вложение может только администратор")

    Path(attachment.storage_path).unlink(missing_ok=True)
    await session.delete(attachment)
    await session.commit()
    log.info("attachment.deleted", attachment_id=attachment_id, by=user.id)


def disk_usage() -> dict[str, int]:
    """Сколько места занимают вложения — показывается в разделе «Безопасность»."""
    root = _storage_root()
    if not root.exists():
        return {"files": 0, "bytes": 0, "free_bytes": 0}
    files = [p for p in root.rglob("*") if p.is_file()]
    return {
        "files": len(files),
        "bytes": sum(p.stat().st_size for p in files),
        "free_bytes": shutil.disk_usage(root).free,
    }
