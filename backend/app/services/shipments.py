"""Бизнес-логика заявок на перевозку: доступ, список, статусы, лента."""

from __future__ import annotations

from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import Numeric, case, func, literal, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, load_only, raiseload, selectinload
from starlette.concurrency import run_in_threadpool

from app.core.attachment_paths import thumbnail_path
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.core.logging import get_logger
from app.core.pagination import PageParams, build_page, paginate
from app.models.crm import Lead
from app.models.shipment import (
    MARGIN_DEDUCTION_RATE,
    Shipment,
    ShipmentStatus,
    TaxRate,
    net_divisor,
)
from app.models.timeline import SHIPMENT_STAGE_LABEL, Attachment, EntryType, TimelineEntry
from app.models.user import Role, User
from app.schemas.crm import NoteCreate, NoteUpdate
from app.schemas.shipment import ShipmentCreate, ShipmentStatusUpdate, ShipmentUpdate
from app.services.leads import get_editable_lead, get_lead_or_404
from app.services.search import LIKE_ESCAPE, like_pattern
from app.services.tags import fetch_tags

log = get_logger(__name__)

# Русские подписи этапов для записи в ленту при смене этапа.
STAGE_LABELS: dict[ShipmentStatus, str] = {
    ShipmentStatus.new: "Новая",
    ShipmentStatus.checked: "Проверена и подписана заявка",
    ShipmentStatus.loaded: "Машина загрузилась",
    ShipmentStatus.unloaded: "Машина выгрузилась",
}


# --- доступ -----------------------------------------------------------------


async def get_shipment_or_404(
    session: AsyncSession,
    shipment_id: int,
    user: User | None = None,
    *,
    allow_lost: bool = False,
    for_update: bool = False,
    for_write: bool = False,
    target_lead_id: int | None = None,
) -> Shipment:
    """`allow_lost=True` — только для чтения: заявка проигранного лида тоже
    становится видна всем, как и сам лид (см. `get_lead_or_404`).

    Теги подгружаем сразу (`selectinload`): без этого присваивание новой
    коллекции `shipment.tags = ...` на уже существующей записи потребовало бы
    синхронной ленивой подгрузки старого значения — на async-сессии это
    падает с `MissingGreenlet`. `populate_existing` на тот же случай
    перезаписывает то, что уже лежит в identity map этой сессии.
    """
    stmt = (
        select(Shipment)
        .where(Shipment.id == shipment_id)
        .options(selectinload(Shipment.tags))
        .execution_options(populate_existing=True)
    )
    # Единый порядок блокировок — сначала лид, потом заявка. Иначе PATCH
    # заявки (shipment -> lead) мог бы deadlock-нуться с удалением лида
    # (lead -> cascade shipment).
    if user is not None and for_write:
        initial = (await session.execute(stmt)).unique().scalar_one_or_none()
        if initial is None:
            raise NotFoundError(f"Заявка {shipment_id} не найдена")
        # Если переносим заявку, блокируем обе карточки в одном порядке по id.
        # Так встречные переносы A→B и B→A не берут блокировки в разном порядке.
        lead_ids = sorted(lead_id for lead_id in {initial.lead_id, target_lead_id} if lead_id is not None)
        for lead_id in lead_ids:
            await get_editable_lead(session, lead_id, user, for_update=True)
        if for_update:
            locked_stmt = stmt.with_for_update(of=Shipment)
            shipment = (await session.execute(locked_stmt)).unique().scalar_one_or_none()
            if shipment is None:
                raise NotFoundError(f"Заявка {shipment_id} не найдена")
            if shipment.lead_id != initial.lead_id:
                raise AppError(
                    "Заявка одновременно изменена другим пользователем. Обновите страницу",
                    code="shipment_conflict",
                    status_code=409,
                )
        else:
            shipment = initial
    else:
        if for_update:
            # `Shipment.lead` тянет nullable joined-связи этапа/ответственного.
            # PostgreSQL запрещает FOR UPDATE всей такой выборки, поэтому явно
            # блокируем только базовую строку shipments.
            stmt = stmt.with_for_update(of=Shipment)
        shipment = (await session.execute(stmt)).unique().scalar_one_or_none()
        if shipment is None:
            raise NotFoundError(f"Заявка {shipment_id} не найдена")
        if user is not None and user.role != Role.admin:
            await get_lead_or_404(session, shipment.lead_id, user, allow_lost=allow_lost)
    return shipment


async def _reload_shipment(session: AsyncSession, shipment_id: int) -> Shipment:
    return await get_shipment_or_404(session, shipment_id)


async def _default_shipment_number(session: AsyncSession, shipment_id: int) -> str:
    """Сначала пробует номер по id; если его заняли, добавляет суффикс."""
    base = str(shipment_id)
    candidate = base
    suffix = 2
    while (
        await session.scalar(
            select(Shipment.id)
            .where(Shipment.number == candidate, Shipment.id != shipment_id)
            .limit(1)
        )
    ) is not None:
        candidate = f"{base}-{suffix}"
        suffix += 1
    return candidate


def visible_shipments(stmt: Any, user: User) -> Any:
    """Менеджеру показываем только заявки по его лидам."""
    if user.role == Role.admin:
        return stmt
    return stmt.where(Shipment.lead_id.in_(select(Lead.id).where(Lead.assigned_to_id == user.id)))


# --- операции над заявками --------------------------------------------------


async def _filter_totals(session: AsyncSession, stmt: Any) -> dict[str, Decimal]:
    """Суммы «Маржа» и «Всего» по всем заявкам фильтра.

    Список отдаёт первую страницу записей, а строка итогов внизу таблицы
    обязана показывать сумму по всему результату — иначе при числе заявок
    больше размера страницы итог занижался бы молча.

    Считает база одним агрегатным запросом (SUM + CASE, Б-26 ревью 06.10):
    раньше все строки фильтра выгружались в Python и суммировались циклом —
    каждая открытая страница списка стоила O(N) памяти и времени. Формула в
    CASE повторяет ``visible_margin`` до копейки: цена без НДС — деление на
    точную ставку, у каждой строки округление до копеек, NULL-цены дают
    NULL-маржу и в сумму не попадают.
    """

    def net_price(price: Any, tax_col: Any) -> Any:
        # CASE подставляет делитель «1 + ставка/100» по значению ставки —
        # как net_divisor() в Python, те же константы.
        return price / case(
            *((tax_col == rate.value, literal(net_divisor(rate), Numeric)) for rate in TaxRate)
        )

    margin_expr = func.round(
        (
            net_price(Shipment.customer_price, Shipment.customer_tax)
            - net_price(Shipment.carrier_price, Shipment.carrier_tax)
        )
        * (Decimal(1) - MARGIN_DEDUCTION_RATE),
        2,
    )
    row = (
        await session.execute(
            stmt.with_only_columns(
                # ROUND вокруг SUM — не только про копейки: в SQLite суммы
                # идут через float, и округление убирает двоичные хвосты.
                func.round(func.coalesce(func.sum(margin_expr), 0), 2),
                func.round(func.coalesce(func.sum(Shipment.customer_price), 0), 2),
            ).order_by(None)
        )
    ).one()
    return {
        "margin": _coerce_decimal(row[0]),
        "customer_total": _coerce_decimal(row[1]),
    }


def _coerce_decimal(value: Any) -> Decimal:
    """SQLite (тесты) возвращает суммы как float — Decimal без двоичных хвостов."""
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


async def list_shipments(
    session: AsyncSession,
    user: User,
    params: PageParams,
    *,
    status_filter: ShipmentStatus | None = None,
    search: str | None = None,
    assigned_to: int | None = None,
) -> dict[str, Any]:
    stmt = visible_shipments(
        select(Shipment).order_by(Shipment.created_at.desc(), Shipment.id.desc()), user
    )
    if assigned_to is not None:
        # Фильтр «заявки сотрудника» — инструмент администратора: менеджер
        # и без него видит только свои заявки, чужие ему смотреть нельзя.
        if user.role != Role.admin:
            raise PermissionDeniedError("Заявки сотрудника может смотреть только администратор")
        stmt = stmt.where(
            Shipment.lead_id.in_(select(Lead.id).where(Lead.assigned_to_id == assigned_to))
        )
    if status_filter is not None:
        stmt = stmt.where(Shipment.status == status_filter)
    if search and search.strip():
        # Экранирование служебных символов ILIKE — в app/services/search.py.
        pattern = like_pattern(search)
        stmt = stmt.join(Lead, Shipment.lead_id == Lead.id)
        stmt = stmt.where(
            or_(
                Shipment.number.ilike(pattern, escape=LIKE_ESCAPE),
                Lead.name.ilike(pattern, escape=LIKE_ESCAPE),
                Shipment.carrier_name.ilike(pattern, escape=LIKE_ESCAPE),
            )
        )
    items, total = await paginate(
        session,
        # В ответе нужны название лида и имя продавца. Этап, причина проигрыша
        # и теги лида не показываются — не загружаем их; теги самой заявки
        # остаются в ответе. Явные связи вместо устаревшего noload сохраняют
        # поля ответа и не тянут лишние данные (Б-23 ревью 06.10).
        stmt.options(
            joinedload(Shipment.lead).options(
                load_only(Lead.id, Lead.name, Lead.assigned_to_id),
                joinedload(Lead.assigned_to).load_only(User.id, User.first_name, User.last_name),
                raiseload(Lead.stage),
                raiseload(Lead.loss_reason),
                raiseload(Lead.tags),
            ),
        ),
        params,
    )
    page = build_page(items, total, params)
    # Итоги «Итого» — по всему фильтру, а не только по открытой странице.
    page["totals"] = await _filter_totals(session, stmt)
    return page


async def create_shipment(session: AsyncSession, user: User, payload: ShipmentCreate) -> Shipment:
    # Заявка может ссылаться только на активный лид, который пользователь вправе менять.
    await get_editable_lead(session, payload.lead_id, user, for_update=True)
    # created_at исключаем отдельно: колонка NOT NULL со server_default=now().
    # Если прислали None (поле не заполнили), явная передача None в конструктор
    # модели перекрыла бы server_default и упала бы на вставке NULL — вместо
    # этого просто не передаём атрибут, и дата проставится сама по умолчанию.
    data = payload.model_dump(exclude={"tag_ids", "created_at"})
    if not payload.number:
        # До получения id временный номер не должен нарушить уникальность.
        data["number"] = f"tmp-{uuid4().hex}"
    shipment = Shipment(**data)
    if payload.created_at is not None:
        shipment.created_at = payload.created_at
    shipment.tags = await fetch_tags(session, payload.tag_ids)
    session.add(shipment)
    await session.flush()
    # Обычно номер по умолчанию равен id. Если пользователь уже присвоил этот
    # номер другой заявке, добавляем суффикс вместо отказа создать новую.
    if not payload.number:
        shipment.number = await _default_shipment_number(session, shipment.id)
    await session.commit()
    log.info("shipment.created", shipment_id=shipment.id, by=user.id)
    return await _reload_shipment(session, shipment.id)


async def update_shipment(
    session: AsyncSession, user: User, shipment_id: int, payload: ShipmentUpdate
) -> Shipment:
    shipment = await get_shipment_or_404(
        session,
        shipment_id,
        user,
        for_update=True,
        for_write=True,
        target_lead_id=payload.lead_id,
    )
    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)

    new_lead_id = data.get("lead_id")
    if new_lead_id is not None and new_lead_id != shipment.lead_id:
        # Проверяем новый лид теми же строгими правами, что и при создании
        # заявки: менеджер не может записать свою заявку в карточку коллеги.
        # Целевой лид уже проверен и заблокирован get_shipment_or_404 выше.

        # lead_id у timeline и attachments денормализован для авторизации,
        # подсчёта места и каскадного удаления. Поэтому переносим весь агрегат
        # одной транзакцией, а не только строку shipments.
        await session.execute(
            update(TimelineEntry)
            .where(TimelineEntry.shipment_id == shipment.id)
            .values(lead_id=new_lead_id)
        )
        await session.execute(
            update(Attachment)
            .where(Attachment.shipment_id == shipment.id)
            .values(lead_id=new_lead_id)
        )

    for key, value in data.items():
        setattr(shipment, key, value)
    if tag_ids is not None:
        shipment.tags = await fetch_tags(session, tag_ids)
    await session.commit()
    log.info(
        "shipment.updated",
        shipment_id=shipment_id,
        fields=sorted(data),
        by=user.id,
    )
    return await _reload_shipment(session, shipment_id)


async def set_status(
    session: AsyncSession, user: User, shipment_id: int, payload: ShipmentStatusUpdate
) -> Shipment:
    shipment = await get_shipment_or_404(session, shipment_id, user, for_update=True, for_write=True)
    previous = shipment.status
    shipment.status = payload.status
    if previous != payload.status:
        # Смена этапа попадает в ленту заявки — как история этапов у лида.
        session.add(
            TimelineEntry(
                lead_id=shipment.lead_id,
                shipment_id=shipment.id,
                author_id=user.id,
                type=EntryType.history,
                field_label=SHIPMENT_STAGE_LABEL,
                old_value=STAGE_LABELS.get(previous, previous.value),
                new_value=STAGE_LABELS.get(payload.status, payload.status.value),
            )
        )
    await session.commit()
    log.info("shipment.status", shipment_id=shipment_id, status=payload.status.value, by=user.id)
    return await _reload_shipment(session, shipment_id)


async def lead_shipments(session: AsyncSession, user: User, lead_id: int) -> list[Shipment]:
    # Чтение — заявки проигранного лида видны всем, как и сам лид.
    await get_lead_or_404(session, lead_id, user, allow_lost=True)
    stmt = select(Shipment).where(Shipment.lead_id == lead_id).order_by(Shipment.created_at.desc())
    return list((await session.execute(stmt)).unique().scalars().all())


# --- лента чаттера заявки ---------------------------------------------------


async def _get_entry_or_404(
    session: AsyncSession, shipment_id: int, entry_id: int
) -> TimelineEntry:
    entry = await session.get(TimelineEntry, entry_id)
    if entry is None or entry.shipment_id != shipment_id:
        raise NotFoundError(f"Запись {entry_id} не найдена")
    return entry


async def shipment_timeline(
    session: AsyncSession, user: User, shipment_id: int
) -> list[TimelineEntry]:
    await get_shipment_or_404(session, shipment_id, user, allow_lost=True)
    stmt = (
        select(TimelineEntry)
        .where(TimelineEntry.shipment_id == shipment_id)
        .order_by(TimelineEntry.created_at.desc())
    )
    return list((await session.execute(stmt)).unique().scalars().all())


async def add_note(
    session: AsyncSession, user: User, shipment_id: int, payload: NoteCreate
) -> TimelineEntry:
    shipment = await get_shipment_or_404(session, shipment_id, user, for_write=True)
    entry = TimelineEntry(
        lead_id=shipment.lead_id,
        shipment_id=shipment.id,
        author_id=user.id,
        type=EntryType.note,
        body=payload.body,
    )
    session.add(entry)
    await session.commit()
    await session.refresh(entry)
    return entry


async def update_entry(
    session: AsyncSession, user: User, shipment_id: int, entry_id: int, payload: NoteUpdate
) -> TimelineEntry:
    await get_shipment_or_404(session, shipment_id, user, for_write=True)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    if entry.type is not EntryType.note:
        raise AppError("Изменять можно только примечания", code="not_editable")
    # Только автор (та же защита, что у примечаний лида — ревью 03.10, Б-11):
    # правка чужой записи оставала бы прежнюю подпись автора.
    if entry.author_id != user.id:
        raise PermissionDeniedError("Изменить примечание может только его автор")
    entry.body = payload.body
    await session.commit()
    await session.refresh(entry)
    return entry


async def delete_entry(session: AsyncSession, user: User, shipment_id: int, entry_id: int) -> None:
    await get_shipment_or_404(session, shipment_id, user, for_write=True)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    # Системная история — аудит изменения заявки. Если разрешить удалить её
    # через ту же ручку, поля можно переписать без проверяемого следа.
    # Исключение одно — запись о переносе заявки между этапами: её по решению
    # владельца (05.10.2026) может убрать любой сотрудник.
    if entry.type is not EntryType.note and not entry.is_stage_change:
        raise AppError(
            "Удалить можно только примечание или запись о смене этапа",
            code="history_immutable",
        )
    attachment_rows = (
        await session.execute(select(Attachment).where(Attachment.entry_id == entry.id))
    ).scalars().all()
    paths: list[Path] = []
    for attachment in attachment_rows:
        if attachment.storage_path:
            original = Path(attachment.storage_path)
            paths.extend((original, thumbnail_path(original)))

    await session.delete(entry)
    await session.commit()
    for path in paths:
        await run_in_threadpool(path.unlink, missing_ok=True)
    log.info(
        "shipment.entry_deleted",
        shipment_id=shipment_id,
        entry_id=entry_id,
        files=len(paths),
        by=user.id,
    )
