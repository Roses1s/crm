"""Служебные команды.

python -m app.cli createsuperuser --email admin@crmdetroid.ru --password ...
python -m app.cli seed     # демо-данные: этапы, теги, лиды, заявки
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.carrier import Carrier
from app.models.crm import Lead, Stage, Tag
from app.models.shipment import Shipment, ShipmentStatus
from app.models.user import Role, User

DEFAULT_STAGES = [
    ("Новый", 1, False, "slate"),
    ("Квалификация", 2, False, "purple"),
    ("Переговоры", 3, False, "blue"),
    ("Договор", 4, False, "orange"),
    ("Выиграно", 5, True, "green"),
]
DEFAULT_TAGS = [
    ("Крупный клиент", "green"),
    ("Рефрижератор", "blue"),
    ("Тендер", "purple"),
    ("Постоянный", "yellow"),
    ("Негабарит", "orange"),
]


async def create_superuser(email: str, password: str) -> None:
    async with SessionLocal() as session:
        exists = (
            await session.execute(select(User).where(User.email == email.lower()))
        ).scalar_one_or_none()
        if exists:
            print(f"Пользователь {email} уже есть (id={exists.id})")
            return
        user = User(
            email=email.lower(),
            hashed_password=hash_password(password),
            first_name="Админ",
            last_name="",
            role=Role.admin,
        )
        session.add(user)
        await session.commit()
        print(f"Создан администратор {email}")


async def seed() -> None:
    async with SessionLocal() as session:
        if int((await session.execute(select(func.count()).select_from(Stage))).scalar_one()) == 0:
            session.add_all(
                Stage(name=n, sequence=s, is_closed=c, color=col) for n, s, c, col in DEFAULT_STAGES
            )
        if int((await session.execute(select(func.count()).select_from(Tag))).scalar_one()) == 0:
            session.add_all(Tag(name=n, color=c) for n, c in DEFAULT_TAGS)
        await session.commit()

        stages = list((await session.execute(select(Stage).order_by(Stage.sequence))).scalars())
        tags = list((await session.execute(select(Tag))).scalars())

        if int((await session.execute(select(func.count()).select_from(Lead))).scalar_one()) == 0:
            demo = [
                ("ООО «Уралпромснаб»", "7451234565", "Громов Сергей", 3, stages[2]),
                ("АО «Сибирский холод»", "5404123455", "Литвинова Ольга", 3, stages[3]),
                ("ООО «Метизный двор»", "7728123459", "Сафин Руслан", 1, stages[0]),
                ("ООО «ТК Восток-Логистик»", "2536123456", "Пак Виктор", 2, stages[1]),
                ("ЗАО «Агрокомплект»", "3444123458", "Мещеряков Павел", 2, stages[4]),
            ]
            for i, (name, inn, contact, priority, stage) in enumerate(demo):
                lead = Lead(
                    name=name,
                    inn=inn,
                    logist_contact=contact,
                    priority=priority,
                    stage_id=stage.id,
                    credit_limit=Decimal("250000"),
                    next_call_date=date.today() + timedelta(days=i),
                )
                lead.tags = tags[: (i % 3) + 1]
                session.add(lead)
            await session.commit()

        if (
            int((await session.execute(select(func.count()).select_from(Carrier))).scalar_one())
            == 0
        ):
            session.add_all(
                [
                    Carrier(name="ООО «АвтоТрансЛайн»", inn="7447112236"),
                    Carrier(name="ООО «РефСервис»", inn="5405998876"),
                ]
            )
            await session.commit()

        if (
            int((await session.execute(select(func.count()).select_from(Shipment))).scalar_one())
            == 0
        ):
            leads = list((await session.execute(select(Lead))).unique().scalars())
            session.add(
                Shipment(
                    lead_id=leads[0].id,
                    city_loading="Челябинск",
                    city_unloading="Новосибирск",
                    status=ShipmentStatus.in_transit,
                )
            )
            await session.commit()

        print("Демо-данные загружены")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    su = sub.add_parser("createsuperuser", help="создать администратора")
    su.add_argument("--email", required=True)
    su.add_argument("--password", required=True)

    sub.add_parser("seed", help="загрузить демо-данные")

    args = parser.parse_args()
    if args.command == "createsuperuser":
        asyncio.run(create_superuser(args.email, args.password))
    else:
        asyncio.run(seed())


if __name__ == "__main__":
    main()
