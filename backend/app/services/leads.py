"""Бизнес-логика лидов: доступ, фильтры, карточка, лента, передача продавцу.

Менеджер работает только со своими карточками (см. `visible_only`), поиск идёт
по названию, ИНН, контакту логиста и его телефону.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.logging import get_logger
from app.core.pagination import PageParams, build_page, paginate
from app.models.crm import Lead, LossReason, lead_tags
from app.models.timeline import Attachment, EntryType, TimelineEntry
from app.models.user import Role, User
from app.schemas.crm import LeadCreate, LeadLose, LeadTransfer, LeadUpdate, NoteCreate, NoteUpdate
from app.services.stages import board_stage_for, stage_on_board
from app.services.tags import fetch_tags

log = get_logger(__name__)


# --- доступ и выборки -------------------------------------------------------


def visible_only(stmt: Select[Lead], user: User) -> Select[Lead]:
    """Менеджер работает только со своими лидами, администратор видит все."""
    if user.role == Role.admin:
        return stmt
    return stmt.where(Lead.assigned_to_id == user.id)


async def get_lead_or_404(
    session: AsyncSession, lead_id: int, user: User | None = None, *, allow_lost: bool = False
) -> Lead:
    """Карточка лида с проверкой доступа.

    `allow_lost=True` — для операций ЧТЕНИЯ (карточка, лента, заявки,
    вложения): проигранный лид открыт любому сотруднику, чтобы его можно было
    посмотреть и забрать себе (см. `restore_lead`). Изменять его при этом
    всё равно нельзя — все мутации идут через строгую проверку (по умолчанию).
    """
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
    # узнать даже факт, что такая карточка есть у коллеги. Исключение —
    # проигранный лид при allow_lost: он общий, его можно посмотреть.
    forbidden = user is not None and user.role != Role.admin and lead.assigned_to_id != user.id
    if forbidden and not (allow_lost and lead.is_archived):
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
    lead.tags = await fetch_tags(session, payload.tag_ids)
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
        # Этапы личные: нельзя переставить лид на колонку чужой доски — она
        # не относится к доске владельца лида, и карточка просто пропала бы
        # из любого канбана (та же защита, что у fallback_stage_id в
        # DELETE /crm/stages/{id} и у board_stage_for при передаче лида).
        if lead.assigned_to_id is None:
            raise AppError(
                "У лида нет ответственного — сначала назначьте продавца",
                code="lead_without_owner",
            )
        new_stage_obj = await stage_on_board(session, new_stage, lead.assigned_to_id)
        old_name = lead.stage.name if lead.stage else "—"
        session.add(
            TimelineEntry(
                lead_id=lead.id,
                author_id=user.id,
                type=EntryType.history,
                field_label="Этапы лидов",
                old_value=old_name,
                new_value=new_stage_obj.name,
            )
        )

    for key, value in data.items():
        setattr(lead, key, value)
    if tag_ids is not None:
        # lead загружен с selectinload(tags) -> коллекция уже в памяти.
        lead.tags = await fetch_tags(session, tag_ids)

    await session.commit()
    log.info("lead.updated", lead_id=lead.id, fields=sorted(data), by=user.id)
    return await get_lead_or_404(session, lead.id)


async def lose_lead(session: AsyncSession, user: User, lead_id: int, payload: LeadLose) -> None:
    """Отмечает лид проигранным — обязательно с причиной.

    Отметить проигравшим можно только свою карточку (как раньше архивацию) —
    строгая проверка доступа. Запись в ленту повторяет вид, в котором это
    всегда показывал Odoo: «Активный: Да → Нет» и «Причина проигрыша: — → …».
    """
    lead = await get_lead_or_404(session, lead_id, user)
    reason = await session.get(LossReason, payload.reason_id)
    if reason is None:
        raise NotFoundError(f"Причина {payload.reason_id} не найдена")

    lead.is_archived = True
    lead.loss_reason_id = reason.id
    session.add_all(
        [
            TimelineEntry(
                lead_id=lead.id,
                author_id=user.id,
                type=EntryType.history,
                field_label="Активный",
                old_value="Да",
                new_value="Нет",
            ),
            TimelineEntry(
                lead_id=lead.id,
                author_id=user.id,
                type=EntryType.history,
                field_label="Причина проигрыша",
                old_value="—",
                new_value=reason.name,
            ),
        ]
    )
    await session.commit()
    log.info("lead.lost", lead_id=lead_id, reason_id=reason.id, by=user.id)


async def restore_lead(session: AsyncSession, user: User, lead_id: int) -> None:
    """Забирает проигранный лид себе и возвращает его на доску.

    Доступно любому сотруднику (не только прежнему владельцу) — проигранный
    лид общий, см. `get_lead_or_404(allow_lost=True)`. Админ может назначить
    проигранный лид и кому-то другому — см. `transfer_lead`, там та же логика
    восстановления работает для произвольного получателя.
    """
    lead = await get_lead_or_404(session, lead_id, user, allow_lost=True)
    if not lead.is_archived:
        raise AppError("Лид не в проигрыше — восстанавливать нечего", code="not_lost")

    previous = lead.assigned_to.full_name if lead.assigned_to else "Не назначен"
    stage_name = lead.stage.name if lead.stage else None
    stage = await board_stage_for(session, user.id, stage_name)

    lead.assigned_to_id = user.id
    lead.stage_id = stage.id
    lead.is_archived = False
    lead.loss_reason_id = None

    entries = [
        TimelineEntry(
            lead_id=lead.id,
            author_id=user.id,
            type=EntryType.history,
            field_label="Активный",
            old_value="Нет",
            new_value="Да",
        )
    ]
    if previous != user.full_name:
        entries.append(
            TimelineEntry(
                lead_id=lead.id,
                author_id=user.id,
                type=EntryType.history,
                field_label="Продавец",
                old_value=previous[:255],
                new_value=user.full_name[:255],
            )
        )
    session.add_all(entries)
    await session.commit()
    log.info("lead.restored", lead_id=lead_id, by=user.id)


async def delete_lead_permanently(session: AsyncSession, user: User, lead_id: int) -> None:
    """Безвозвратно удаляет лид: заявки, ленту переписки и вложения — тоже.

    В отличие от проигрыша (мягкое удаление, см. `lose_lead`) эта операция
    необратима и доступна только администратору — рядовой менеджер может лишь
    отметить свою карточку проигранной. Файлы вложений лежат на диске отдельно от базы,
    поэтому их приходится собирать и удалять вручную, не полагаясь на
    ORM-каскад (он покрывает только вложения, прицепленные к записям ленты).
    """
    lead = await get_lead_or_404(session, lead_id, user)
    if user.role != Role.admin:
        raise PermissionDeniedError("Безвозвратно удалить лид может только администратор")

    # lead_id у вложений заявки тоже указывает на лид (см. комментарий в
    # models/timeline.py), поэтому один запрос находит файлы и самого лида,
    # и всех его заявок разом.
    attachments = (
        (await session.execute(select(Attachment).where(Attachment.lead_id == lead_id)))
        .scalars()
        .all()
    )
    paths = [Path(a.storage_path) for a in attachments if a.storage_path]

    # Строки из базы удаляются каскадом (заявки и лента — через ORM-cascade на
    # Lead, вложения — через ON DELETE CASCADE в базе), поэтому достаточно
    # удалить сам объект лида.
    await session.delete(lead)
    await session.commit()

    # Диск чистим уже после успешного commit: если бы файл стёрся раньше,
    # а транзакция потом откатилась, он пропал бы, а запись в базе осталась.
    for path in paths:
        await run_in_threadpool(path.unlink, missing_ok=True)

    log.info("lead.deleted", lead_id=lead_id, files=len(paths), by=user.id)


async def transfer_lead(
    session: AsyncSession, user: User, lead_id: int, payload: LeadTransfer
) -> None:
    """Меняет продавца и переставляет карточку на доску получателя.

    Одно без другого не имеет смысла: этапы личные, и лид с чужим stage_id
    не попал бы ни в одну колонку новой доски.

    Если лид был в проигрыше, передача заодно его восстанавливает — так админ
    может назначить проигранный лид конкретному сотруднику (а не только
    выдать его желающим через `restore_lead`). Поэтому «уже закреплён за этим
    сотрудником» здесь не ошибка, если лид как раз нужно восстановить тому же
    человеку, у которого он был до проигрыша.
    """
    lead = await get_lead_or_404(session, lead_id, user)
    was_lost = lead.is_archived

    target = await session.get(User, payload.user_id)
    if target is None or not target.is_active:
        raise NotFoundError(f"Сотрудник {payload.user_id} не найден")
    if target.id == lead.assigned_to_id and not was_lost:
        raise AppError("Лид уже закреплён за этим сотрудником", code="already_assigned")

    previous = lead.assigned_to.full_name if lead.assigned_to else "Не назначен"
    stage_name = lead.stage.name if lead.stage else None
    stage = await board_stage_for(session, target.id, stage_name)

    lead.assigned_to_id = target.id
    lead.stage_id = stage.id

    # Передача попадает в ленту: по истории видно, кто и кому отдал клиента.
    entries = [
        TimelineEntry(
            lead_id=lead.id,
            author_id=user.id,
            type=EntryType.history,
            field_label="Продавец",
            old_value=previous[:255],
            new_value=target.full_name[:255],
        )
    ]
    if was_lost:
        lead.is_archived = False
        lead.loss_reason_id = None
        entries.append(
            TimelineEntry(
                lead_id=lead.id,
                author_id=user.id,
                type=EntryType.history,
                field_label="Активный",
                old_value="Нет",
                new_value="Да",
            )
        )
    session.add_all(entries)
    await session.commit()
    log.info("lead.transferred", lead_id=lead.id, to=target.id, was_lost=was_lost, by=user.id)


# --- лента чаттера ----------------------------------------------------------


async def lead_timeline(session: AsyncSession, user: User, lead_id: int) -> list[TimelineEntry]:
    # Чтение — проигранный лид открыт всем, см. get_lead_or_404(allow_lost=True).
    await get_lead_or_404(session, lead_id, user, allow_lost=True)
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
    # История этапов/передач/проигрыша — системный аудит, а не пользовательская
    # заметка. Она остаётся неизменяемой даже при прямом вызове API.
    if entry.type is not EntryType.note:
        raise AppError("Системную историю нельзя удалить", code="history_immutable")
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

    Диапазон листания дополнительно сужен до доски того сотрудника, чей лид
    открыт (``assigned_to_id`` самого лида). Для менеджера это ничего не
    меняет — он и так видит только свои карточки, — а для администратора
    избавляет от неожиданного перескока на лида другого менеджера: без этого
    сужения листалка считала позицию и соседей по всей базе сразу, вперемешку
    по всем сотрудникам.
    """
    lead = await get_lead_or_404(session, lead_id, user)

    base = visible_only(select(Lead).where(Lead.is_archived.is_(False)), user).where(
        Lead.assigned_to_id == lead.assigned_to_id
    )

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
