"""Служебные команды.

python -m app.cli createsuperuser --email admin@crmdetroid.ru --password ...
python -m app.cli seed     # демо-данные: этапы, теги, лиды, заявки
python -m app.cli resetboard --email admin@crmdetroid.ru  # вернуть доску к стандартной
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.crm import Lead, Stage, Tag
from app.models.shipment import Shipment, ShipmentStatus
from app.models.user import Role, User
from app.services.stages import DEFAULT_STAGES as BOARD_STAGES

DEFAULT_STAGES = [
    ("Новый", 1, "slate"),
    ("Квалификация", 2, "purple"),
    ("Переговоры", 3, "blue"),
    ("Договор", 4, "orange"),
    ("Выиграно", 5, "green"),
]
# Стандартная воронка менеджера — та же, что создаётся при первом входе,
# импортирована из app.services.stages, чтобы не держать два списка в
# разных местах, которые легко рассинхронизировать правкой только одного.
DEFAULT_TAGS = [
    ("Крупный клиент", "green"),
    ("Рефрижератор", "blue"),
    ("Тендер", "purple"),
    ("Постоянный", "yellow"),
    ("Негабарит", "orange"),
]


async def reset_board(email: str) -> None:
    """Возвращает доску сотрудника к стандартному набору этапов.

    Нужна после перехода на личные доски: администратору достались колонки
    прежней общей воронки, а у менеджеров набор другой. Лиды не теряются —
    они переезжают в первый этап новой доски.
    """
    async with SessionLocal() as session:
        user = (
            await session.execute(select(User).where(User.email == email.lower()))
        ).scalar_one_or_none()
        if user is None:
            print(f"Пользователь {email} не найден")
            return

        old = list(
            (await session.execute(select(Stage).where(Stage.owner_id == user.id))).scalars()
        )

        fresh = [
            Stage(name=name, color=color, sequence=index, owner_id=user.id)
            for index, (name, color) in enumerate(BOARD_STAGES, start=1)
        ]
        session.add_all(fresh)
        await session.flush()

        # Сначала перевозим карточки, иначе база не даст удалить старые этапы.
        old_ids = [stage.id for stage in old]
        moved = 0
        if old_ids:
            leads = list(
                (await session.execute(select(Lead).where(Lead.stage_id.in_(old_ids))))
                .unique()
                .scalars()
            )
            by_name = {stage.name: stage for stage in fresh}
            old_by_id = {stage.id: stage for stage in old}
            for lead in leads:
                previous = old_by_id.get(lead.stage_id)
                same_name = by_name.get(previous.name) if previous else None
                lead.stage_id = (same_name or fresh[0]).id
                moved += 1
            await session.flush()

        for stage in old:
            await session.delete(stage)
        await session.commit()

        print(
            f"Доска {email} собрана заново: {len(fresh)} этапов, "
            f"удалено старых {len(old)}, перенесено лидов {moved}"
        )


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
        # Этапы принадлежат конкретному сотруднику (личные доски), поэтому
        # демо-воронку заводим на первом администраторе. Без него этапы
        # создавать нельзя — поле владельца обязательное.
        admin = (
            await session.execute(select(User).where(User.role == Role.admin).limit(1))
        ).scalar_one_or_none()
        if admin is None:
            print("Сначала создайте администратора: python -m app.cli createsuperuser")
            return

        if int((await session.execute(select(func.count()).select_from(Stage))).scalar_one()) == 0:
            session.add_all(
                Stage(name=n, sequence=s, color=col, owner_id=admin.id)
                for n, s, col in DEFAULT_STAGES
            )
        if int((await session.execute(select(func.count()).select_from(Tag))).scalar_one()) == 0:
            session.add_all(Tag(name=n, color=c) for n, c in DEFAULT_TAGS)
        await session.commit()

        stages = list((await session.execute(select(Stage).order_by(Stage.sequence))).scalars())
        tags = list((await session.execute(select(Tag))).scalars())

        # Демо-лиды вешаем на того же администратора: доска показывает только
        # карточки своего владельца, иначе на свежей установке она пустая.
        owner = admin

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
                    assigned_to_id=owner.id if owner else None,
                )
                lead.tags = tags[: (i % 3) + 1]
                session.add(lead)
            await session.commit()

        if (
            int((await session.execute(select(func.count()).select_from(Shipment))).scalar_one())
            == 0
        ):
            leads = list((await session.execute(select(Lead))).unique().scalars())
            demo_shipment = Shipment(
                lead_id=leads[0].id,
                loading_cities=["Челябинск"],
                unloading_cities=["Новосибирск"],
                status=ShipmentStatus.loaded,
                # Перевозчика теперь просто вписывают текстом в саму заявку.
                carrier_name="ООО «АвтоТрансЛайн»",
                carrier_inn="7447112236",
            )
            session.add(demo_shipment)
            await session.flush()
            demo_shipment.number = str(demo_shipment.id)
            await session.commit()

        print("Демо-данные загружены")


def main() -> None:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    su = sub.add_parser("createsuperuser", help="создать администратора")
    su.add_argument("--email", required=True)
    su.add_argument("--password", required=True)

    sub.add_parser("seed", help="загрузить демо-данные")

    rb = sub.add_parser("resetboard", help="вернуть доску сотрудника к стандартной")
    rb.add_argument("--email", required=True)

    args = parser.parse_args()
    if args.command == "createsuperuser":
        asyncio.run(create_superuser(args.email, args.password))
    elif args.command == "resetboard":
        asyncio.run(reset_board(args.email))
    else:
        asyncio.run(seed())


if __name__ == "__main__":
    main()
