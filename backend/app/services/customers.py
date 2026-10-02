"""Модуль «Клиенты»: все лиды компании одним списком, с маскировкой чужих.

В отличие от `services.leads.visible_only` (менеджер видит только свои
карточки), здесь видно вообще всё — но чужой АКТИВНЫЙ лид отдаётся в урезанном
виде (название, ИНН, кто ведёт) и помечается `can_open=False`, чтобы фронтенд
не пускал на карточку. Проигранный лид — свой или чужой — всегда открыт
полностью: его может посмотреть и забрать себе любой сотрудник.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.pagination import PageParams, build_page, paginate
from app.models.crm import Lead
from app.models.user import Role, User


def _can_open(lead: Lead, user: User) -> bool:
    return user.role == Role.admin or lead.assigned_to_id == user.id or lead.is_archived


def _to_customer(lead: Lead, user: User) -> dict[str, Any]:
    can_open = _can_open(lead, user)
    row: dict[str, Any] = {
        "id": lead.id,
        "name": lead.name,
        "inn": lead.inn,
        "assigned_to_id": lead.assigned_to_id,
        "assigned_to_name": lead.assigned_to_name,
        "is_archived": lead.is_archived,
        "can_open": can_open,
        "loss_reason_name": lead.loss_reason_name,
        "updated_at": lead.updated_at,
    }
    if can_open:
        row.update(
            logist_contact=lead.logist_contact,
            logist_phone=lead.logist_phone,
            logist_email=lead.logist_email,
            priority=lead.priority,
            stage_name=lead.stage_name,
            tags=lead.tags,
        )
    return row


async def list_customers(
    session: AsyncSession,
    user: User,
    params: PageParams,
    *,
    search: str | None = None,
) -> dict[str, Any]:
    """Все лиды компании, активные и проигранные вперемешку.

    Поиск — только по названию и ИНН: это единственные поля, видимые на
    чужом активном лиде, остальные фильтры по скрытым полям превратили бы
    маскировку в решето (можно было бы нащупать контакт перебором).
    """
    # populate_existing: без него уже загруженный объект лида (например, тот
    # же, что секунду назад поменяли через /lose в этой же сессии) отдаёт
    # старые значения связей (stage/loss_reason) из identity map — тот же
    # трюк, что и в get_lead_or_404.
    stmt = select(Lead).order_by(Lead.updated_at.desc()).execution_options(populate_existing=True)
    if search:
        pattern = f"%{search.strip()}%"
        stmt = stmt.where(or_(Lead.name.ilike(pattern), Lead.inn.ilike(pattern)))

    items, total = await paginate(session, stmt, params)
    customers = [_to_customer(lead, user) for lead in items]
    return build_page(customers, total, params)


async def find_by_inn(
    session: AsyncSession, user: User, inn: str, *, exclude_id: int | None = None
) -> list[dict[str, Any]]:
    """Лиды с точно таким же ИНН — для предупреждения о дубле.

    Используется и при создании лида (``exclude_id`` не передаётся — нечего
    исключать), и при редактировании уже существующего (``exclude_id`` —
    id самого редактируемого лида, иначе он бы постоянно «находил дубль
    самого себя»). Ищем среди вообще всех лидов (не только своих), но
    отдаём их тем же урезанным видом, что и список «Клиенты»: для чужого
    активного лида — не больше, чем уже и так видно на той странице
    (название, ИНН, ответственный). Проверка строго на точное совпадение:
    раз ИНН уже проверен контрольной суммой, не нужен ни ilike, ни частичное
    совпадение — только дубль.
    """
    stmt = select(Lead).where(Lead.inn == inn)
    if exclude_id is not None:
        stmt = stmt.where(Lead.id != exclude_id)
    rows = (await session.execute(stmt)).scalars().all()
    return [_to_customer(lead, user) for lead in rows]
