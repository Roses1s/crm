"""Активности по лидам: позвонить, встретиться, сделать.

Логика повторяет Odoo: у лида есть список незакрытых действий, ближайший срок
подсвечивает часики на карточке канбана, а закрытие действия попадает в ленту
чаттера — чтобы по истории было видно, что работа велась.
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.api.v1.leads import get_lead_or_404
from app.core.errors import NotFoundError, PermissionDeniedError
from app.core.logging import get_logger
from app.models.activity import Activity
from app.models.timeline import EntryType, TimelineEntry
from app.models.user import Role
from app.schemas.crm import ActivityCreate, ActivityRead, ActivityUpdate

router = APIRouter(prefix="/crm", tags=["crm: активности"])
log = get_logger(__name__)

TYPE_LABELS = {
    "call": "Звонок",
    "meeting": "Встреча",
    "todo": "Задача",
    "email": "Письмо",
}


async def _get_or_404(session: SessionDep, activity_id: int) -> Activity:
    activity = (
        await session.execute(select(Activity).where(Activity.id == activity_id))
    ).scalar_one_or_none()
    if activity is None:
        raise NotFoundError(f"Активность {activity_id} не найдена")
    return activity


@router.get(
    "/leads/{lead_id}/activities",
    response_model=list[ActivityRead],
    summary="Действия по лиду",
)
async def list_activities(
    lead_id: int, session: SessionDep, _: CurrentUser, include_done: bool = False
) -> list[Activity]:
    await get_lead_or_404(session, lead_id)
    stmt = select(Activity).where(Activity.lead_id == lead_id)
    if not include_done:
        stmt = stmt.where(Activity.is_done.is_(False))
    stmt = stmt.order_by(Activity.is_done, Activity.due_date)
    return list((await session.execute(stmt)).unique().scalars().all())


@router.post(
    "/leads/{lead_id}/activities",
    response_model=ActivityRead,
    status_code=status.HTTP_201_CREATED,
    summary="Запланировать действие",
)
async def create_activity(
    lead_id: int, payload: ActivityCreate, session: SessionDep, user: CurrentUser
) -> Activity:
    await get_lead_or_404(session, lead_id)
    activity = Activity(lead_id=lead_id, **payload.model_dump())
    # По умолчанию действие на том, кто его создал.
    if activity.assigned_to_id is None:
        activity.assigned_to_id = user.id
    session.add(activity)
    await session.commit()
    await session.refresh(activity)
    log.info("activity.created", id=activity.id, lead_id=lead_id, by=user.id)
    return activity


@router.patch(
    "/activities/{activity_id}", response_model=ActivityRead, summary="Изменить или закрыть"
)
async def update_activity(
    activity_id: int, payload: ActivityUpdate, session: SessionDep, user: CurrentUser
) -> Activity:
    activity = await _get_or_404(session, activity_id)
    data = payload.model_dump(exclude_unset=True)

    closing = data.get("is_done") is True and not activity.is_done
    if data.get("is_done") is False:
        activity.done_at = None

    for key, value in data.items():
        setattr(activity, key, value)

    if closing:
        activity.done_at = datetime.now(tz=UTC)
        # Закрытое действие остаётся в истории лида.
        session.add(
            TimelineEntry(
                lead_id=activity.lead_id,
                author_id=user.id,
                type=EntryType.activity,
                body=f"{TYPE_LABELS.get(activity.type.value, 'Действие')}: {activity.summary}",
                field_label="Активность выполнена",
            )
        )

    await session.commit()
    await session.refresh(activity)
    return activity


@router.delete(
    "/activities/{activity_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Удалить действие",
)
async def delete_activity(activity_id: int, session: SessionDep, user: CurrentUser) -> None:
    activity = await _get_or_404(session, activity_id)
    if activity.assigned_to_id != user.id and user.role not in (Role.admin, Role.manager):
        raise PermissionDeniedError("Удалить действие может исполнитель или руководитель")
    await session.delete(activity)
    await session.commit()


@router.get("/activities/my", response_model=list[ActivityRead], summary="Мои действия")
async def my_activities(session: SessionDep, user: CurrentUser) -> list[Activity]:
    """Все незакрытые действия текущего пользователя — по возрастанию срока."""
    stmt = (
        select(Activity)
        .where(Activity.assigned_to_id == user.id, Activity.is_done.is_(False))
        .order_by(Activity.due_date)
    )
    return list((await session.execute(stmt)).unique().scalars().all())
