"""Бизнес-логика лидов: доступ, фильтры, карточка, лента, передача продавцу.

Менеджер работает только со своими карточками (см. `visible_only`), поиск идёт
по названию, ИНН, контакту логиста и его телефону.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.v1.stages import board_stage_for
from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.core.pagination import PageParams, build_page, paginate
from app.models.crm import Lead, Tag, lead_tags
from app.models.timeline import EntryType, TimelineEntry
from app.models.user import Role, User
from app.schemas.crm import LeadCreate, LeadTransfer, LeadUpdate, NoteCreate, NoteUpdate

log = get_logger(__name__)


# --- доступ и выборки -------------------------------------------------------


def visible_only(stmt: Select[Lead], user: User) -> Select[Lead]:
    """Менеджер работает только со своими лидами, администратор видит все."""
    if user.role == Role.admin:
        return stmt
    return stmt.where(Lead.assigned_to_id == user.id)


async def get_lead_or_404(session: AsyncSession, lead_id: int, user: User | None = None) -> Lead:
    # populate_existing перезаписывает уже загруженные связи: без него после
    # смены этапа в ответе оставался бы старый stage из identity map.
    stmt = (
        select(Lead)
        .where(Lead.id == lead_id)
        .options(selectinload(Lead.tags))
        .execution_options(populate_existing=True)
    )
    lead = (await session.execute(stmt)).unique().scalar_one_or_none()
    if lead is None:
        raise NotFoundError(f"Лид {lead_id} не найден")
    # Чужой лид для менеджера просто «не существует»: так из ответа нельзя
    # узнать даже факт, что такая карточка есть у коллеги.
    if user is not None and user.role != Role.admin and lead.assigned_to_id != user.id:
        raise NotFoundError(f"Лид {lead_id} не найден")
    return lead


def apply_filters(
    stmt: Select[Lead],
    *,
    search: str | None,
    stage: int | None,
    tag: int | None,
    priority: int | None,
    is_archived: bool | None,
    assigned_to: int | None,
) -> Select[Lead]:
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(
            or_(
                Lead.name.ilike(pattern),
                Lead.inn.ilike(pattern),
                Lead.logist_contact.ilike(pattern),
                Lead.logist_phone.ilike(pattern),
            )
        )
    if stage is not None:
        stmt = stmt.where(Lead.stage_id == stage)
    if tag is not None:
        stmt = stmt.where(Lead.id.in_(select(lead_tags.c.lead_id).where(lead_tags.c.tag_id == tag)))
    if priority is not None:
        stmt = stmt.where(Lead.priority == priority)
    if assigned_to is not None:
        stmt = stmt.where(Lead.assigned_to_id == assigned_to)
    stmt = stmt.where(Lead.is_archived.is_(bool(is_archived)))
    return stmt


async def _fetch_tags(session: AsyncSession, tag_ids: list[int]) -> list[Tag]:
    if not tag_ids:
        return []
    rows = (await session.execute(select(Tag).where(Tag.id.in_(tag_ids)))).scalars().all()
    return list(rows)


# --- операции над лидами ----------------------------------------------------


async def list_leads(
    session: AsyncSession,
    user: User,
    params: PageParams,
    *,
    search: str | None = None,
    stage: int | None = None,
    tag: int | None = None,
    priority: int | None = None,
    assigned_to: int | None = None,
    is_archived: bool = False,
) -> dict[str, Any]:
    stmt = apply_filters(
        visible_only(
            select(Lead).options(selectinload(Lead.tags)).order_by(Lead.updated_at.desc()), user
        ),
        search=search,
        stage=stage,
        tag=tag,
        priority=priority,
        is_archived=is_archived,
        assigned_to=assigned_to,
    )
    items, total = await paginate(session, stmt, params)
    return build_page(items, total, params)


async def create_lead(session: AsyncSession, user: User, payload: LeadCreate) -> Lead:
    data = payload.model_dump(exclude={"tag_ids"})
    lead = Lead(**data)
    # Теги проставляем ДО add/flush: у ещё не сохранённого объекта присваивание
    # коллекции не требует подгрузки старого значения из базы.
    lead.tags = await _fetch_tags(session, payload.tag_ids)
    # Менеджер не может создать лид «на коллегу»: карточка появляется на его доске.
    if lead.assigned_to_id is None or user.role != Role.admin:
        lead.assigned_to_id = user.id
    session.add(lead)
    await session.commit()
    log.info("lead.created", lead_id=lead.id, by=user.id)
    return await get_lead_or_404(session, lead.id)


async def update_lead(session: AsyncSession, user: User, lead_id: int, payload: LeadUpdate) -> Lead:
    lead = await get_lead_or_404(session, lead_id, user)
    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)

    # Смена этапа попадает в ленту — так в чаттере видно историю движения.
    new_stage = data.get("stage_id")
    if new_stage is not None and new_stage != lead.stage_id:
        old_name = lead.stage.name if lead.stage else "—"
        new_stage_obj = await session.get(type(lead.stage), new_stage)
        session.add(
            TimelineEntry(
                lead_id=lead.id,
                author_id=user.id,
                type=EntryType.history,
                field_label="Этапы лидов",
                old_value=old_name,
                new_value=new_stage_obj.name if new_stage_obj else str(new_stage),
            )
        )

    for key, value in data.items():
        setattr(lead, key, value)
    if tag_ids is not None:
        # lead загружен с selectinload(tags) -> коллекция уже в памяти.
        lead.tags = await _fetch_tags(session, tag_ids)

    await session.commit()
    log.info("lead.updated", lead_id=lead.id, fields=sorted(data), by=user.id)
    return await get_lead_or_404(session, lead.id)


async def archive_lead(session: AsyncSession, user: User, lead_id: int) -> None:
    lead = await get_lead_or_404(session, lead_id, user)
    lead.is_archived = True
    await session.commit()
    log.info("lead.archived", lead_id=lead_id, by=user.id)


async def transfer_lead(
    session: AsyncSession, user: User, lead_id: int, payload: LeadTransfer
) -> None:
    """Меняет продавца и переставляет карточку на доску получателя.

    Одно без другого не имеет смысла: этапы личные, и лид с чужим stage_id
    не попал бы ни в одну колонку новой доски.
    """
    lead = await get_lead_or_404(session, lead_id, user)

    target = await session.get(User, payload.user_id)
    if target is None or not target.is_active:
        raise NotFoundError(f"Сотрудник {payload.user_id} не найден")
    if target.id == lead.assigned_to_id:
        raise AppError("Лид уже закреплён за этим сотрудником", code="already_assigned")

    previous = lead.assigned_to.full_name if lead.assigned_to else "Не назначен"
    stage_name = lead.stage.name if lead.stage else None
    stage = await board_stage_for(session, target.id, stage_name)

    lead.assigned_to_id = target.id
    lead.stage_id = stage.id
    # Передача попадает в ленту: по истории видно, кто и кому отдал клиента.
    session.add(
        TimelineEntry(
            lead_id=lead.id,
            author_id=user.id,
            type=EntryType.history,
            field_label="Продавец",
            old_value=previous[:255],
            new_value=target.full_name[:255],
        )
    )
    await session.commit()
    log.info("lead.transferred", lead_id=lead.id, to=target.id, by=user.id)


# --- лента чаттера ----------------------------------------------------------


async def lead_timeline(session: AsyncSession, user: User, lead_id: int) -> list[TimelineEntry]:
    await get_lead_or_404(session, lead_id, user)
    stmt = (
        select(TimelineEntry)
        .where(TimelineEntry.lead_id == lead_id, TimelineEntry.shipment_id.is_(None))
        .order_by(TimelineEntry.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


async def _get_entry_or_404(session: AsyncSession, lead_id: int, entry_id: int) -> TimelineEntry:
    entry = await session.get(TimelineEntry, entry_id)
    if entry is None or entry.lead_id != lead_id:
        raise NotFoundError(f"Запись {entry_id} не найдена")
    return entry


async def add_note(
    session: AsyncSession, user: User, lead_id: int, payload: NoteCreate
) -> TimelineEntry:
    await get_lead_or_404(session, lead_id, user)
    entry = TimelineEntry(
        lead_id=lead_id, author_id=user.id, type=EntryType.note, body=payload.body
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def update_timeline_entry(
    session: AsyncSession, user: User, lead_id: int, entry_id: int, payload: NoteUpdate
) -> TimelineEntry:
    await get_lead_or_404(session, lead_id, user)
    entry = await _get_entry_or_404(session, lead_id, entry_id)
    if entry.type is not EntryType.note:
        raise AppError("Изменять можно только примечания", code="not_editable")
    entry.body = payload.body
    await session.commit()
    await session.refresh(entry)
    return entry


async def delete_timeline_entry(
    session: AsyncSession, user: User, lead_id: int, entry_id: int
) -> None:
    await get_lead_or_404(session, lead_id, user)
    entry = await _get_entry_or_404(session, lead_id, entry_id)
    await session.delete(entry)
    await session.commit()
    log.info("timeline.entry_deleted", lead_id=lead_id, entry_id=entry_id, by=user.id)


# --- переключатель «N / M» --------------------------------------------------


async def lead_pager(session: AsyncSession, user: User, lead_id: int) -> dict[str, int | None]:
    """Данные для переключателя «N / M» в карточке лида.

    Считаем только по видимым лидам: раньше сюда попадала вся база, и менеджер
    узнавал количество чужих карточек и номера соседних записей.
    Позиция и соседи берутся запросами с ограничением, без выгрузки всех
    идентификаторов в память — на большой базе это заметно быстрее.
    """
    lead = await get_lead_or_404(session, lead_id, user)

    base = visible_only(select(Lead).where(Lead.is_archived.is_(False)), user)

    total = int(
        (
            await session.execute(
                select(func.count()).select_from(base.with_only_columns(Lead.id).subquery())
            )
        ).scalar_one()
    )

    # Порядок тот же, что в списке: сначала недавно изменённые. Время у двух
    # карточек может совпасть до миллисекунды, поэтому при равенстве сравниваем
    # ещё и номер — иначе запись находит сама себя как соседнюю.
    # Время берём подзапросом, а не из объекта: SQLite хранит дату без часового
    # пояса, и сравнение с «питоновским» значением уводило запрос в никуда —
    # запись находила сама себя как соседнюю.
    marker = select(Lead.updated_at).where(Lead.id == lead.id).scalar_subquery()
    after = or_(
        Lead.updated_at < marker,
        and_(Lead.updated_at == marker, Lead.id < lead.id),
    )
    before = or_(
        Lead.updated_at > marker,
        and_(Lead.updated_at == marker, Lead.id > lead.id),
    )

    newer = int(
        (
            await session.execute(
                select(func.count()).select_from(
                    base.with_only_columns(Lead.id).where(before).subquery()
                )
            )
        ).scalar_one()
    )

    prev_id = (
        await session.execute(
            base.with_only_columns(Lead.id)
            .where(before)
            .order_by(Lead.updated_at, Lead.id)
            .limit(1)
        )
    ).scalar_one_or_none()

    next_id = (
        await session.execute(
            base.with_only_columns(Lead.id)
            .where(after)
            .order_by(Lead.updated_at.desc(), Lead.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    return {
        "position": newer + 1,
        "total": total,
        "prev_id": prev_id,
        "next_id": next_id,
    }
