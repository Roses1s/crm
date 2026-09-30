"""HTTP-слой лидов: маршруты, параметры запроса, коды ответов.

Бизнес-логика живёт в `app.services.leads` — здесь только разбор запроса
и вызов сервиса.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep
from app.core.pagination import Page, PageParams, page_params
from app.models.timeline import TimelineEntry
from app.models.user import User
from app.schemas.crm import (
    LeadCreate,
    LeadRead,
    LeadTransfer,
    LeadUpdate,
    NoteCreate,
    NoteUpdate,
    TimelineEntryRead,
)
from app.services import leads as service
from app.services.leads import get_lead_or_404, visible_only

router = APIRouter(prefix="/crm/leads", tags=["crm: лиды"])

PageParamsDep = Annotated[PageParams, Depends(page_params)]


@router.get("", response_model=Page[LeadRead], summary="Список лидов")
async def list_leads(
    session: SessionDep,
    user: CurrentUser,
    params: PageParamsDep,
    search: Annotated[str | None, Query(description="Поиск по названию, ИНН, контакту")] = None,
    stage: int | None = None,
    tag: int | None = None,
    priority: Annotated[int | None, Query(ge=0, le=3)] = None,
    assigned_to: int | None = None,
    is_archived: bool = False,
) -> dict[str, Any]:
    return await service.list_leads(
        session,
        user,
        params,
        search=search,
        stage=stage,
        tag=tag,
        priority=priority,
        assigned_to=assigned_to,
        is_archived=is_archived,
    )


@router.post(
    "", response_model=LeadRead, status_code=status.HTTP_201_CREATED, summary="Создать лид"
)
async def create_lead(payload: LeadCreate, session: SessionDep, user: CurrentUser) -> Any:
    return await service.create_lead(session, user, payload)


@router.get("/{lead_id}", response_model=LeadRead, summary="Карточка лида")
async def get_lead(lead_id: int, session: SessionDep, user: CurrentUser) -> Any:
    return await service.get_lead_or_404(session, lead_id, user)


@router.patch("/{lead_id}", response_model=LeadRead, summary="Изменить лид")
async def update_lead(
    lead_id: int, payload: LeadUpdate, session: SessionDep, user: CurrentUser
) -> Any:
    return await service.update_lead(session, user, lead_id, payload)


@router.delete("/{lead_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Архивировать лид")
async def archive_lead(lead_id: int, session: SessionDep, user: CurrentUser) -> None:
    await service.archive_lead(session, user, lead_id)


@router.get(
    "/{lead_id}/timeline",
    response_model=list[TimelineEntryRead],
    summary="Лента чаттера",
)
async def lead_timeline(
    lead_id: int, session: SessionDep, user: CurrentUser
) -> list[TimelineEntry]:
    return await service.lead_timeline(session, user, lead_id)


@router.post(
    "/{lead_id}/notes",
    response_model=TimelineEntryRead,
    status_code=status.HTTP_201_CREATED,
    summary="Добавить примечание",
)
async def add_note(
    lead_id: int, payload: NoteCreate, session: SessionDep, user: CurrentUser
) -> TimelineEntry:
    return await service.add_note(session, user, lead_id, payload)


@router.patch(
    "/{lead_id}/timeline/{entry_id}",
    response_model=TimelineEntryRead,
    summary="Изменить примечание",
)
async def update_timeline_entry(
    lead_id: int,
    entry_id: int,
    payload: NoteUpdate,
    session: SessionDep,
    user: CurrentUser,
) -> TimelineEntry:
    return await service.update_timeline_entry(session, user, lead_id, entry_id, payload)


@router.delete(
    "/{lead_id}/timeline/{entry_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить запись из ленты",
)
async def delete_timeline_entry(
    lead_id: int, entry_id: int, session: SessionDep, user: CurrentUser
) -> None:
    await service.delete_timeline_entry(session, user, lead_id, entry_id)


@router.post(
    "/{lead_id}/transfer",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Передать лид другому сотруднику",
)
async def transfer_lead(
    lead_id: int, payload: LeadTransfer, session: SessionDep, user: CurrentUser
) -> None:
    await service.transfer_lead(session, user, lead_id, payload)


@router.get("/{lead_id}/pager", summary="Позиция записи и соседи")
async def lead_pager(lead_id: int, session: SessionDep, user: CurrentUser) -> dict[str, int | None]:
    return await service.lead_pager(session, user, lead_id)


# get_lead_or_404/visible_only переэкспортируем: ими пользуются соседние
# роутеры (заявки, вложения) для проверки доступа к лиду.
__all__ = ["User", "get_lead_or_404", "router", "visible_only"]
