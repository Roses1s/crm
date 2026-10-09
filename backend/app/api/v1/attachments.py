"""HTTP-слой вложений лидов и заявок.

Бизнес-логика (запись на диск, белый список типов, права) — в
`app.services.attachments`.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, File, Query, UploadFile, status
from fastapi.responses import FileResponse

from app.api.deps import CurrentUser, SessionDep
from app.models.timeline import Attachment
from app.schemas.crm import AttachmentRead
from app.services import attachments as service
from app.services.attachments import (
    ALLOWED_EXTENSIONS,
    INLINE_TYPES,
    THUMBNAIL_CONTENT_TYPE,
    disk_usage,
)

router = APIRouter(prefix="/crm", tags=["crm: вложения"])
# Заявки живут вне префикса /crm, поэтому их вложениям нужен отдельный роутер.
shipment_router = APIRouter(tags=["заявки: вложения"])


@router.get(
    "/leads/{lead_id}/attachments",
    response_model=list[AttachmentRead],
    summary="Вложения лида",
)
async def list_attachments(
    lead_id: int, session: SessionDep, user: CurrentUser
) -> list[Attachment]:
    return await service.list_lead_attachments(session, user, lead_id)


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
    return await service.upload_lead_attachment(session, user, lead_id, file, entry_id)


@shipment_router.get(
    "/shipments/{shipment_id}/attachments",
    response_model=list[AttachmentRead],
    summary="Вложения заявки",
)
async def list_shipment_attachments(
    shipment_id: int, session: SessionDep, user: CurrentUser
) -> list[Attachment]:
    return await service.list_shipment_attachments(session, user, shipment_id)


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
    entry_id: Annotated[int | None, Query(description="Привязать файл к записи ленты")] = None,
) -> Attachment:
    return await service.upload_shipment_attachment(session, user, shipment_id, file, entry_id)


@router.get(
    "/attachments/{attachment_id}/thumbnail",
    summary="Миниатюра изображения",
)
async def download_attachment_thumbnail(
    attachment_id: int, session: SessionDep, user: CurrentUser
) -> FileResponse:
    _, path = await service.get_thumbnail(session, user, attachment_id)
    return FileResponse(
        path,
        media_type=THUMBNAIL_CONTENT_TYPE,
        filename=f"attachment-{attachment_id}-thumbnail.webp",
        content_disposition_type="inline",
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/attachments/{attachment_id}", summary="Скачать файл")
async def download_attachment(
    attachment_id: int, session: SessionDep, user: CurrentUser
) -> FileResponse:
    attachment, path, disposition = await service.get_for_download(session, user, attachment_id)
    return FileResponse(
        path,
        media_type=attachment.content_type or "application/octet-stream",
        filename=attachment.name,
        content_disposition_type=disposition,
        headers={
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.delete(
    "/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить файл",
)
async def delete_attachment(attachment_id: int, session: SessionDep, user: CurrentUser) -> None:
    await service.delete_attachment(session, user, attachment_id)


# disk_usage переэкспортируем: им пользуется раздел «Безопасность» в админке.
__all__ = ["ALLOWED_EXTENSIONS", "INLINE_TYPES", "disk_usage", "router", "shipment_router"]
