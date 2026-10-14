"""Справочник бухгалтеров и проверка назначений в карточках лидов."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError
from app.models.crm import Accountant

# Исторически утверждённый список переносится миграцией в таблицу accountants.
# Значения здесь нужны для подготовки тестовой базы; миграцию не импортируем из приложения.
DEFAULT_ACCOUNTANT_NAMES = (
    "Пухова Елена Витальевна",
    "Кузьмина Виктория Павловна",
    "Белякова Ольга Александровна",
    "Терентьева Елена Александровна",
    "Горнагина Ирина Анатольевна",
    "Дремова Наталья Александровна",
    "Позднякова Лилия Усманова",
    "Рыбина Екатерина",
    "Гуцол Катерина Евгеньевна",
    "Колясникова Алина",
)

ACCOUNTANT_NAME_LOCK_NAMESPACE = 4231


def accountant_name_key(name: str) -> str:
    """Сравнивает ФИО без учёта регистра и лишних пробелов, в том числе кириллицу."""
    return " ".join(name.split()).casefold()


async def lock_accountant_name(session: AsyncSession, name: str) -> None:
    """Не допускает параллельного создания/переименования в одно ФИО."""
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        await session.execute(
            text("SELECT pg_advisory_xact_lock(4231, hashtext(:name))"),
            {"name": accountant_name_key(name)},
        )


async def find_accountant_by_name(session: AsyncSession, name: str) -> Accountant | None:
    """Список маленький; Python casefold надёжнее SQLite lower для кириллицы."""
    key = accountant_name_key(name)
    rows = (await session.execute(select(Accountant).order_by(Accountant.id))).scalars().all()
    return next(
        (accountant for accountant in rows if accountant_name_key(accountant.name) == key),
        None,
    )


async def _accountant_for_update(session: AsyncSession, accountant_id: int) -> Accountant | None:
    return (
        await session.execute(
            select(Accountant)
            .where(Accountant.id == accountant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()


async def list_accountants(session: AsyncSession, *, active_only: bool) -> list[Accountant]:
    stmt = select(Accountant)
    if active_only:
        stmt = stmt.where(Accountant.is_active.is_(True))
    rows = list((await session.execute(stmt)).scalars().all())
    return sorted(
        rows,
        key=lambda accountant: (not accountant.is_active, accountant.name.casefold()),
    )


async def create_accountant(session: AsyncSession, name: str) -> Accountant:
    await lock_accountant_name(session, name)
    existing = await find_accountant_by_name(session, name)
    if existing is not None:
        detail = f"Бухгалтер «{existing.name}» уже есть в справочнике — " + (
            "восстановите его" if not existing.is_active else "измените ФИО"
        )
        raise AppError(detail, code="accountant_name_conflict", status_code=409)

    accountant = Accountant(name=name, is_active=True)
    session.add(accountant)
    await session.commit()
    await session.refresh(accountant)
    return accountant


async def update_accountant(
    session: AsyncSession, accountant_id: int, changes: Mapping[str, Any]
) -> Accountant:
    name = changes.get("name")
    if name is not None:
        await lock_accountant_name(session, name)

    accountant = await _accountant_for_update(session, accountant_id)
    if accountant is None:
        raise NotFoundError(f"Бухгалтер {accountant_id} не найден")

    if name is not None:
        if accountant_name_key(name) != accountant_name_key(accountant.name):
            existing = await find_accountant_by_name(session, name)
            if existing is not None and existing.id != accountant.id:
                raise AppError(
                    f"ФИО «{existing.name}» уже есть в справочнике",
                    code="accountant_name_conflict",
                    status_code=409,
                )
        # Даже если совпадает только регистр/пробелы, сохраняем введённый
        # нормализованный вариант, чтобы администратор мог поправить ФИО.
        accountant.name = name

    await session.commit()
    await session.refresh(accountant)
    return accountant


async def deactivate_accountant(session: AsyncSession, accountant_id: int) -> None:
    """Скрывает ФИО из новых назначений, не стирая его из карточек лидов."""
    accountant = await _accountant_for_update(session, accountant_id)
    if accountant is None:
        raise NotFoundError(f"Бухгалтер {accountant_id} не найден")
    accountant.is_active = False
    await session.commit()


async def restore_accountant(session: AsyncSession, accountant_id: int) -> Accountant:
    accountant = await _accountant_for_update(session, accountant_id)
    if accountant is None:
        raise NotFoundError(f"Бухгалтер {accountant_id} не найден")
    await lock_accountant_name(session, accountant.name)

    existing = await find_accountant_by_name(session, accountant.name)
    if existing is not None and existing.id != accountant.id:
        raise AppError(
            f"ФИО «{existing.name}» уже есть в справочнике",
            code="accountant_name_conflict",
            status_code=409,
        )
    accountant.is_active = True
    await session.commit()
    await session.refresh(accountant)
    return accountant


async def validate_lead_accountant(
    session: AsyncSession, name: str | None, *, current_name: str | None = None
) -> str | None:
    """Разрешает активные ФИО и сохраняет прежнее имя после архивирования/переименования."""
    if name is None:
        return None

    accountant = await find_accountant_by_name(session, name)
    if accountant is not None:
        # Назначение и архивирование сериализуются на строке справочника.
        accountant = await _accountant_for_update(session, accountant.id)
    if accountant is not None and accountant.is_active:
        return accountant.name

    if current_name is not None and accountant_name_key(name) == accountant_name_key(current_name):
        # Старое ФИО остаётся видимым в карточке, но его нельзя назначать
        # другим лидам после удаления или переименования в справочнике.
        return current_name

    raise AppError(
        "Выбранный бухгалтер больше не доступен. Обновите список и выберите действующего",
        code="accountant_unavailable",
        status_code=422,
    )
