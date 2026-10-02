"""Бизнес-логика заявок на перевозку: доступ, список, статусы, лента."""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import AppError, NotFoundError
from app.core.logging import get_logger
from app.core.pagination import PageParams, build_page, paginate
from app.models.carrier import Carrier
from app.models.crm import Lead
from app.models.shipment import Shipment, ShipmentStatus
from app.models.timeline import EntryType, TimelineEntry
from app.models.user import Role, User
from app.schemas.crm import NoteCreate, NoteUpdate
from app.schemas.shipment import ShipmentCreate, ShipmentStatusUpdate, ShipmentUpdate
from app.services.leads import get_lead_or_404
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
    session: AsyncSession, shipment_id: int, user: User | None = None, *, allow_lost: bool = False
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
    shipment = (await session.execute(stmt)).unique().scalar_one_or_none()
    if shipment is None:
        raise NotFoundError(f"Заявка {shipment_id} не найдена")
    # Заявка наследует видимость своего лида: чужая для менеджера не существует.
    if user is not None and user.role != Role.admin:
        await get_lead_or_404(session, shipment.lead_id, user, allow_lost=allow_lost)
    return shipment


async def _reload_shipment(session: AsyncSession, shipment_id: int) -> Shipment:
    return await get_shipment_or_404(session, shipment_id)


def visible_shipments(stmt: Any, user: User) -> Any:
    """Менеджеру показываем только заявки по его лидам."""
    if user.role == Role.admin:
        return stmt
    return stmt.where(Shipment.lead_id.in_(select(Lead.id).where(Lead.assigned_to_id == user.id)))


# --- операции над заявками --------------------------------------------------


async def list_shipments(
    session: AsyncSession,
    user: User,
    params: PageParams,
    *,
    status_filter: ShipmentStatus | None = None,
    search: str | None = None,
) -> dict[str, Any]:
    stmt = visible_shipments(select(Shipment).order_by(Shipment.created_at.desc()), user)
    if status_filter is not None:
        stmt = stmt.where(Shipment.status == status_filter)
    if search and search.strip():
        # Экранируем спецсимволы ILIKE (% и _), иначе поиск, например,
        # «50%» молча вёл бы себя как маска «50» + что угодно.
        escaped = search.strip().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        pattern = f"%{escaped}%"
        stmt = stmt.join(Lead, Shipment.lead_id == Lead.id).outerjoin(
            Carrier, Shipment.carrier_id == Carrier.id
        )
        stmt = stmt.where(
            or_(
                Shipment.number.ilike(pattern, escape="\\"),
                Lead.name.ilike(pattern, escape="\\"),
                Carrier.name.ilike(pattern, escape="\\"),
            )
        )
    items, total = await paginate(session, stmt, params)
    return build_page(items, total, params)


async def create_shipment(session: AsyncSession, user: User, payload: ShipmentCreate) -> Shipment:
    # Заявку можно завести только по своему лиду.
    await get_lead_or_404(session, payload.lead_id, user)
    # created_at исключаем отдельно: колонка NOT NULL со server_default=now().
    # Если прислали None (поле не заполнили), явная передача None в конструктор
    # модели перекрыла бы server_default и упала бы на вставке NULL — вместо
    # этого просто не передаём атрибут, и дата проставится сама по умолчанию.
    data = payload.model_dump(exclude={"tag_ids", "created_at"})
    shipment = Shipment(**data)
    if payload.created_at is not None:
        shipment.created_at = payload.created_at
    shipment.tags = await fetch_tags(session, payload.tag_ids)
    session.add(shipment)
    await session.flush()
    # Номер по умолчанию = id — но это только стартовое значение, дальше
    # пользователь волен переименовать его во что угодно.
    if not shipment.number:
        shipment.number = str(shipment.id)
    await session.commit()
    log.info("shipment.created", shipment_id=shipment.id, by=user.id)
    return await _reload_shipment(session, shipment.id)


async def update_shipment(
    session: AsyncSession, user: User, shipment_id: int, payload: ShipmentUpdate
) -> Shipment:
    shipment = await get_shipment_or_404(session, shipment_id, user)
    data = payload.model_dump(exclude_unset=True)
    tag_ids = data.pop("tag_ids", None)
    for key, value in data.items():
        setattr(shipment, key, value)
    if tag_ids is not None:
        shipment.tags = await fetch_tags(session, tag_ids)
    await session.commit()
    return await _reload_shipment(session, shipment_id)


async def set_status(
    session: AsyncSession, user: User, shipment_id: int, payload: ShipmentStatusUpdate
) -> Shipment:
    shipment = await get_shipment_or_404(session, shipment_id, user)
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
                field_label="Этап",
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
    shipment = await get_shipment_or_404(session, shipment_id, user)
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
    await get_shipment_or_404(session, shipment_id, user)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    if entry.type is not EntryType.note:
        raise AppError("Изменять можно только примечания", code="not_editable")
    entry.body = payload.body
    await session.commit()
    await session.refresh(entry)
    return entry


async def delete_entry(session: AsyncSession, user: User, shipment_id: int, entry_id: int) -> None:
    await get_shipment_or_404(session, shipment_id, user)
    entry = await _get_entry_or_404(session, shipment_id, entry_id)
    await session.delete(entry)
    await session.commit()
    log.info("shipment.entry_deleted", shipment_id=shipment_id, entry_id=entry_id, by=user.id)
