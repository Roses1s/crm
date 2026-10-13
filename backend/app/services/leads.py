"""Бизнес-логика лидов: доступ, фильтры, карточка, лента, передача продавцу.

Менеджер работает только со своими карточками (см. `visible_only`), поиск идёт
по названию, ИНН, контакту логиста и его телефону.
"""

from __future__ import annotations

from datetime import UTC
from pathlib import Path
from typing import Any

from sqlalchemy import Select, String, and_, cast, func, or_, select, true
from sqlalchemy import update as sql_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from app.core.attachment_paths import thumbnail_path
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.logging import get_logger
from app.core.pagination import PageParams, build_page, paginate
from app.models.crm import Lead, LossReason, Stage, lead_tags
from app.models.timeline import LEAD_STAGE_LABEL, Attachment, EntryType, TimelineEntry
from app.models.user import Role, User
from app.schemas.crm import LeadCreate, LeadLose, LeadTransfer, LeadUpdate, NoteCreate, NoteUpdate
from app.services.lead_versions import advance_lead_version, next_lead_updated_at
from app.services.search import LIKE_ESCAPE, like_pattern
from app.services.stages import board_stage_for, stage_on_board
from app.services.tags import fetch_tags

log = get_logger(__name__)


# --- Доступ и выборки ---


def visible_only(stmt: Select[Lead], user: User) -> Select[Lead]:
    """Менеджер работает только со своими лидами, администратор видит все."""
    if user.role == Role.admin:
        return stmt
    return stmt.where(Lead.assigned_to_id == user.id)


async def get_lead_or_404(
    session: AsyncSession, lead_id: int, user: User | None = None, *, allow_lost: bool = False
) -> Lead:
    """Карточка лида с проверкой доступа.

    `allow_lost=True` разрешает любому сотруднику читать проигранную карточку,
    ленту и вложения. Проверка состояния для изменений вынесена в
    `get_editable_lead`: до восстановления проигранный лид доступен только для
    чтения. Восстановление и передача используют эту функцию напрямую, потому
    что сами возвращают карточку в работу.
    """
    # populate_existing заставляет перезаписать уже загруженные связи: без
    # него после смены этапа ответ унёс бы старый stage из identity map.
    stmt = (
        select(Lead)
        .where(Lead.id == lead_id)
        .options(selectinload(Lead.tags))
        .execution_options(populate_existing=True)
    )
    lead = (await session.execute(stmt)).unique().scalar_one_or_none()
    if lead is None:
        raise NotFoundError(f"Лид {lead_id} не найден")
    # Чужой лид для менеджера «не существует» (404): по ответу нельзя узнать
    # даже сам факт, что карточка есть у коллеги. Исключение — проигранный
    # лид при allow_lost: он общий и доступен для просмотра всем.
    forbidden = user is not None and user.role != Role.admin and lead.assigned_to_id != user.id
    if forbidden and not (allow_lost and lead.is_archived):
        raise NotFoundError(f"Лид {lead_id} не найден")
    return lead


async def get_editable_lead(
    session: AsyncSession, lead_id: int, user: User, *, for_update: bool = False
) -> Lead:
    """Проверяет право записи; при необходимости блокирует лид до конца транзакции."""
    stmt = (
        select(Lead)
        .where(Lead.id == lead_id)
        .options(selectinload(Lead.tags))
        .execution_options(populate_existing=True)
    )
    if for_update:
        stmt = stmt.with_for_update(of=Lead)
    lead = (await session.execute(stmt)).unique().scalar_one_or_none()
    if lead is None:
        raise NotFoundError(f"Лид {lead_id} не найден")
    forbidden = user.role != Role.admin and lead.assigned_to_id != user.id
    if forbidden:
        raise NotFoundError(f"Лид {lead_id} не найден")
    if lead.is_archived:
        raise AppError(
            "Сначала восстановите проигранный лид, затем редактируйте его",
            code="lead_lost",
            status_code=409,
        )
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
        # Служебные символы `%` и `_` экранируются: иначе поиск «50%»
        # сработал бы как маска и вернул все записи (app/services/search.py).
        pattern = like_pattern(search)
        stmt = stmt.where(
            or_(
                Lead.name.ilike(pattern, escape=LIKE_ESCAPE),
                Lead.inn.ilike(pattern, escape=LIKE_ESCAPE),
                Lead.logist_contact.ilike(pattern, escape=LIKE_ESCAPE),
                Lead.logist_phone.ilike(pattern, escape=LIKE_ESCAPE),
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


# --- Операции над лидами ---


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
            select(Lead)
            .options(selectinload(Lead.tags))
            # id вторым ключом делает порядок страниц устойчивым, даже когда
            # у нескольких карточек одинаковое время изменения.
            .order_by(Lead.updated_at.desc(), Lead.id.desc()),
            user,
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
    # Владельца определяем до проверки этапа: этап обязан принадлежать его
    # доске. Когда проверка жила только в PATCH, создание через POST могло
    # спрятать новый лид на чужой канбан (ревью 06.10, Б-10).
    assigned_to_id = data["assigned_to_id"]
    if assigned_to_id is None or user.role != Role.admin:
        assigned_to_id = user.id
    await stage_on_board(session, data["stage_id"], assigned_to_id)
    data["assigned_to_id"] = assigned_to_id

    lead = Lead(**data)
    # Теги проставляем до add/flush: у ещё не сохранённого объекта
    # присваивание коллекции не требует подгрузки старого значения из базы.
    lead.tags = await fetch_tags(session, payload.tag_ids)
    session.add(lead)
    await session.commit()
    log.info("lead.created", lead_id=lead.id, by=user.id)
    return await get_lead_or_404(session, lead.id)


async def update_lead(session: AsyncSession, user: User, lead_id: int, payload: LeadUpdate) -> Lead:
    lead = await get_editable_lead(session, lead_id, user, for_update=True)
    expected_updated_at = payload.expected_updated_at
    data = payload.model_dump(exclude_unset=True, exclude={"expected_updated_at"})
    tag_ids = data.pop("tag_ids", None)

    # Смена этапа записывается в ленту: в чаттере видна история движения
    # карточки по воронке.
    new_stage = data.get("stage_id")
    if new_stage is not None and new_stage != lead.stage_id:
        # Этапы принадлежат личным доскам: переставить лид на колонку чужой
        # доски нельзя — карточка пропала бы из любого канбана. Та же защита
        # стоит у fallback_stage_id в DELETE /crm/stages/{id} и у
        # board_stage_for при передаче лида.
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
                field_label=LEAD_STAGE_LABEL,
                old_value=old_name,
                new_value=new_stage_obj.name,
            )
        )

    # Сравнение и сдвиг версии — один условный UPDATE: если другой запрос
    # уже сохранил карточку, обновление затронет ноль строк и не затрёт его
    # поля. Версию двигаем минимум на микросекунду: SQLite в тестах и часть
    # драйверов округляют CURRENT_TIMESTAMP до целой секунды.
    next_updated_at = next_lead_updated_at(lead.updated_at)
    if session.get_bind().dialect.name == "sqlite":
        # SQLite хранит CURRENT_TIMESTAMP без дробной части, а SQLAlchemy
        # сравнивает DateTime с суффиксом .000000. Обе стороны нормализуем
        # как текст, сохраняя ненулевые микросекунды версии.
        expected_utc = (
            expected_updated_at.replace(tzinfo=UTC)
            if expected_updated_at.tzinfo is None
            else expected_updated_at.astimezone(UTC)
        )
        expected_text = expected_utc.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S.%f")
        if expected_text.endswith(".000000"):
            expected_text = expected_text.removesuffix(".000000")
        version_match = func.replace(cast(Lead.updated_at, String), ".000000", "") == expected_text
    else:
        version_match = Lead.updated_at == expected_updated_at

    result = await session.execute(
        sql_update(Lead)
        .where(Lead.id == lead_id, version_match)
        .values(updated_at=next_updated_at)
        .execution_options(synchronize_session=False)
    )
    if getattr(result, "rowcount", 0) != 1:
        raise AppError(
            "Карточка уже изменена другим пользователем. Обновите её перед повторной правкой",
            code="lead_conflict",
            status_code=409,
        )

    lead.updated_at = next_updated_at
    for key, value in data.items():
        setattr(lead, key, value)
    if tag_ids is not None:
        # lead загружен с selectinload(tags): коллекция тегов уже в памяти,
        # дополнительного запроса за ней не будет.
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
    lead = await get_editable_lead(session, lead_id, user, for_update=True)
    # Удаление причины в справочнике блокирует ту же строку, что и
    # назначение: обе операции сериализуются на уровне PostgreSQL.
    reason = (
        await session.execute(
            select(LossReason).where(LossReason.id == payload.reason_id).with_for_update()
        )
    ).scalar_one_or_none()
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
    advance_lead_version(lead)
    await session.commit()
    log.info("lead.lost", lead_id=lead_id, reason_id=reason.id, by=user.id)


async def restore_lead(session: AsyncSession, user: User, lead_id: int) -> None:
    """Забирает проигранный лид себе и возвращает его на доску.

    Доступно любому сотруднику (не только прежнему владельцу) — проигранный
    лид общий, см. `get_lead_or_404(allow_lost=True)`. Админ может назначить
    проигранный лид и кому-то другому — см. `transfer_lead`, там та же логика
    восстановления работает для произвольного получателя.
    """
    # Строку блокируем до проверки состояния: два одновременных запроса не
    # должны оба «успешно» восстановить один лид и перезаписать владельца
    # друг у друга.
    stmt = (
        select(Lead)
        .where(Lead.id == lead_id)
        .options(selectinload(Lead.tags))
        .execution_options(populate_existing=True)
        .with_for_update(of=Lead)
    )
    lead = (await session.execute(stmt)).unique().scalar_one_or_none()
    if lead is None:
        raise NotFoundError(f"Лид {lead_id} не найден")
    if user.role != Role.admin and lead.assigned_to_id != user.id and not lead.is_archived:
        raise NotFoundError(f"Лид {lead_id} не найден")
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
    advance_lead_version(lead)
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
    if user.role != Role.admin:
        raise PermissionDeniedError("Безвозвратно удалить лид может только администратор")
    # Удаление сериализуем с загрузкой файлов: загрузчик блокирует эту же
    # строку перед коммитом, поэтому список файлов будет полным — либо
    # загрузка отменится целиком.
    stmt = (
        select(Lead)
        .where(Lead.id == lead_id)
        .options(selectinload(Lead.tags))
        .execution_options(populate_existing=True)
        .with_for_update(of=Lead)
    )
    lead = (await session.execute(stmt)).unique().scalar_one_or_none()
    if lead is None:
        raise NotFoundError(f"Лид {lead_id} не найден")

    # lead_id заполнен и у вложений заявки (models/timeline.py), поэтому
    # один запрос находит файлы самого лида и всех его заявок разом.
    attachments = (
        (await session.execute(select(Attachment).where(Attachment.lead_id == lead_id)))
        .scalars()
        .all()
    )
    paths: list[Path] = []
    for attachment in attachments:
        if attachment.storage_path:
            original = Path(attachment.storage_path)
            paths.extend((original, thumbnail_path(original)))

    # Всё остальное удаляется каскадом: заявки и лента — ORM-каскадом на
    # Lead, вложения — ON DELETE CASCADE в базе. Поэтому достаточно удалить
    # сам объект лида.
    await session.delete(lead)
    await session.commit()

    # Диск чистим только после успешного коммита: стёртый раньше файл при
    # откате транзакции пропал бы, а запись о нём в базе осталась.
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
    # Передача может одновременно восстановить проигранный лид, поэтому
    # берём ту же блокировку, что и restore_lead: операции не должны
    # перезаписывать друг друга.
    stmt = (
        select(Lead)
        .where(Lead.id == lead_id)
        .options(selectinload(Lead.tags))
        .execution_options(populate_existing=True)
        .with_for_update(of=Lead)
    )
    lead = (await session.execute(stmt)).unique().scalar_one_or_none()
    if lead is None:
        raise NotFoundError(f"Лид {lead_id} не найден")
    forbidden = user.role != Role.admin and lead.assigned_to_id != user.id
    # Передача не обходит общий запрет на работу с проигранными: передать
    # такой лид может только администратор через явную операцию
    # восстановления, а не обычным действием менеджера.
    if forbidden or (lead.is_archived and user.role != Role.admin):
        raise NotFoundError(f"Лид {lead_id} не найден")
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

    # Передача записывается в ленту: по истории видно, кто, кому и когда
    # отдал клиента.
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
    advance_lead_version(lead)
    await session.commit()
    log.info("lead.transferred", lead_id=lead.id, to=target.id, was_lost=was_lost, by=user.id)


# --- Лента чаттера ---


async def lead_timeline(session: AsyncSession, user: User, lead_id: int) -> list[TimelineEntry]:
    # Чтение повторяет карточку: проигранный лид открыт всем
    # (get_lead_or_404 с allow_lost=True).
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
    await get_editable_lead(session, lead_id, user, for_update=True)
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
    await get_editable_lead(session, lead_id, user, for_update=True)
    entry = await _get_entry_or_404(session, lead_id, entry_id)
    if entry.type is not EntryType.note:
        raise AppError("Изменять можно только примечания", code="not_editable")
    # Примечание правит только автор: запись подписана его именем, и
    # переписанный чужой текст выглядел бы его словами. Администратору тоже
    # нельзя — при необходимости запись удаляют и пишут свою (03.10, Б-11).
    if entry.author_id != user.id:
        raise PermissionDeniedError("Изменить примечание может только его автор")
    entry.body = payload.body
    await session.commit()
    await session.refresh(entry)
    return entry


async def delete_timeline_entry(
    session: AsyncSession, user: User, lead_id: int, entry_id: int
) -> None:
    await get_editable_lead(session, lead_id, user, for_update=True)
    entry = await _get_entry_or_404(session, lead_id, entry_id)
    # История передач и проигрыша — системный аудит, а не заметка
    # пользователя: она неизменяема даже при прямом вызове API. Единственное
    # исключение — запись о переносе между этапами: её по решению владельца
    # (05.10.2026) может убрать любой сотрудник.
    if entry.type is not EntryType.note and not entry.is_stage_change:
        raise AppError(
            "Удалить можно только примечание или запись о смене этапа",
            code="history_immutable",
        )
    attachment_rows = (
        (await session.execute(select(Attachment).where(Attachment.entry_id == entry.id)))
        .scalars()
        .all()
    )
    paths: list[Path] = []
    for attachment in attachment_rows:
        if attachment.storage_path:
            original = Path(attachment.storage_path)
            paths.extend((original, thumbnail_path(original)))

    await session.delete(entry)
    await session.commit()
    # Строки вложений удалены каскадом; сами файлы удаляем только после
    # коммита — при откате записи и файлы должны остаться парой.
    for path in paths:
        await run_in_threadpool(path.unlink, missing_ok=True)
    log.info(
        "timeline.entry_deleted",
        lead_id=lead_id,
        entry_id=entry_id,
        files=len(paths),
        by=user.id,
    )


# --- Переключатель «N / M» ---


async def lead_pager(session: AsyncSession, user: User, lead_id: int) -> dict[str, int | None]:
    """Данные для переключателя «N / M» в карточке лида.

    Считаем только по видимым лидам: раньше сюда попадала вся база, и менеджер
    узнавал количество чужих карточек и номера соседних записей.
    Позиция и соседи берутся запросами с ограничением, без выгрузки всех
    идентификаторов в память — на большой базе это заметно быстрее.

    Диапазон листания дополнительно сужен до доски того сотрудника, чей лид
    открыт (``assigned_to_id`` самого лида). Для менеджера это ничего не
    меняет — он и так видит только свои карточки, — а для администратора
    избавляет от неожиданного перескока на лида другого менеджера.

    Порядок листания — как читается доска: колонки по порядку (этапы по
    ``sequence``, при равенстве — по номеру этапа), внутри колонки карточки
    по номеру. Верхняя левая карточка доски всегда первая. Раньше порядок
    брался по времени изменения — он не совпадал с доской, и первая карточка
    показывалась, например, «4 из 6».
    """
    lead = await get_lead_or_404(session, lead_id, user)

    # Оставить карточку «ничьей» через API нельзя (в LeadUpdate
    # ответственного нет, передача — отдельной ручкой), но листание не
    # ломается и при прямых правках базы: сравнение с NULL в SQL всегда
    # ложно, и диапазон лида без ответственного просто не сужается его
    # доской (Б-27).
    board_filter = (
        Lead.assigned_to_id == lead.assigned_to_id if lead.assigned_to_id is not None else true()
    )
    base = visible_only(select(Lead).where(Lead.is_archived.is_(False)), user).where(board_filter)
    # Этап нужен для порядка «колонка за колонкой»; соединение здесь
    # один-к-одному, поэтому строки не размножаются и счёт не врёт.
    board = base.with_only_columns(Lead.id).join(Stage, Lead.stage_id == Stage.id)

    total = int(
        (await session.execute(select(func.count()).select_from(board.subquery()))).scalar_one()
    )

    # «Выше в порядке чтения» означает меньшую тройку: этап, порядковый
    # номер этапа внутри доски, номер лида внутри колонки.
    sequence, stage_pk = lead.stage.sequence, lead.stage.id
    before = or_(
        Stage.sequence < sequence,
        and_(Stage.sequence == sequence, Stage.id < stage_pk),
        and_(Stage.sequence == sequence, Stage.id == stage_pk, Lead.id < lead.id),
    )
    after = or_(
        Stage.sequence > sequence,
        and_(Stage.sequence == sequence, Stage.id > stage_pk),
        and_(Stage.sequence == sequence, Stage.id == stage_pk, Lead.id > lead.id),
    )

    newer = int(
        (
            await session.execute(select(func.count()).select_from(board.where(before).subquery()))
        ).scalar_one()
    )

    # Предыдущая карточка — самая «нижняя» среди стоящих выше по порядку
    # чтения, следующая — самая «верхняя» среди стоящих ниже.
    prev_id = (
        await session.execute(
            board.where(before)
            .order_by(Stage.sequence.desc(), Stage.id.desc(), Lead.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    next_id = (
        await session.execute(
            board.where(after).order_by(Stage.sequence, Stage.id, Lead.id).limit(1)
        )
    ).scalar_one_or_none()

    return {
        "position": newer + 1,
        "total": total,
        "prev_id": prev_id,
        "next_id": next_id,
    }
