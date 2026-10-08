"""Заполняет только изолированную базу данными для Playwright/Chromium."""

from __future__ import annotations

import asyncio
import os
from decimal import Decimal

from sqlalchemy import func, select

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.crm import Lead, Stage
from app.models.shipment import Shipment, ShipmentStatus
from app.models.user import Role, User

EMAIL = "playwright@crmdetroid.ru"
PASSWORD = "BrowserTest123!"
LEAD_COUNT = 161
FIRST_STAGE_COUNT = 21


async def seed() -> None:
    if os.environ.get("PLAYWRIGHT_TEST_DATABASE") != "1":
        raise SystemExit("Отказ: для тестовых данных задайте PLAYWRIGHT_TEST_DATABASE=1")
    if settings.is_production or "test" not in settings.plain_dsn.lower():
        raise SystemExit("Отказ: адрес базы должен содержать test, production запрещён")

    async with SessionLocal() as session:
        existing = int((await session.execute(select(func.count()).select_from(User))).scalar_one())
        if existing:
            raise SystemExit("Отказ: база не пустая; скрипт ничего не удаляет и не перезаписывает")

        admin = User(
            email=EMAIL,
            hashed_password=hash_password(PASSWORD),
            first_name="Браузер",
            last_name="Тест",
            role=Role.admin,
        )
        session.add(admin)
        await session.flush()

        first = Stage(name="Новый", sequence=1, color="blue", owner_id=admin.id)
        second = Stage(name="Переговоры", sequence=2, color="green", owner_id=admin.id)
        session.add_all([first, second])
        await session.flush()

        leads = [
            Lead(
                name=f"Тестовый клиент {number:03d}",
                inn=f"770{number:07d}",
                stage_id=first.id if number <= FIRST_STAGE_COUNT else second.id,
                assigned_to_id=admin.id,
                priority=number % 4,
            )
            for number in range(1, LEAD_COUNT + 1)
        ]
        session.add_all(leads)
        await session.flush()

        session.add_all(
            Shipment(
                number=f"PW-{number:03d}",
                lead_id=lead.id,
                status=ShipmentStatus.new,
                loading_cities=["Москва"],
                unloading_cities=["Санкт-Петербург"],
                customer_price=Decimal("1000.00"),
                carrier_price=Decimal("700.00"),
            )
            for number, lead in enumerate(leads, start=1)
        )
        await session.commit()

    print(f"Создан тестовый пользователь и {LEAD_COUNT} лидов и заявок")


if __name__ == "__main__":
    asyncio.run(seed())
