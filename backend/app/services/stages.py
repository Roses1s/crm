"""Бизнес-логика этапов канбана (личные доски сотрудников).

Раньше эти функции жили прямо в `app.api.v1.stages`, и `app.services.leads`
импортировал их оттуда — сервисный слой тянул зависимость из HTTP-слоя, хотя
должно быть наоборот. Здесь — чистая бизнес-логика без FastAPI; роутер
`api/v1/stages.py` импортирует её для своих ручек.
"""

from __future__ import annotations

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.models.crm import Lead, Stage
from app.models.timeline import LEAD_STAGE_LABEL, EntryType, TimelineEntry
from app.models.user import Role, User
from app.services.lead_versions import advance_lead_version

# Набор, с которого начинает каждый менеджер. Дальше он правит его под себя:
# переименовывает, двигает, удаляет — у коллег доска не меняется.
DEFAULT_STAGES: list[tuple[str, str]] = [
    ("Новый", "slate"),
    ("Перезвонить", "orange"),
    ("Вышел на ЛПР", "blue"),
    ("Потенциальный клиент", "purple"),
    ("Уехали, ждём заявку", "green"),
]


async def ensure_default_stages(
    session: AsyncSession, owner_id: int, *, commit: bool = True
) -> None:
    """Создаёт стандартную воронку, если у сотрудника ещё нет ни одного этапа.

    ``commit=False`` оставляет изменения в транзакции вызывающей операции;
    например, удаление сотрудника должно удерживать блокировку до конца.

    «Проверили — вставили» без защиты могло выполниться дважды: два
    одновременных первых запроса (вход с двух устройств, два админa открыли
    доску нового сотрудника) оба не находили этапов и создавали по воронке —
    карточки «расползались» по одинаковым колонкам (ревью 03.10, Б-17).
    Поэтому на PostgreSQL проверка-и-вставка сериализуется транзакционной
    advisory-блокировкой по номеру сотрудника: второй запрос ждёт первого и
    видит уже созданную доску. В SQLite (тесты) она не нужна — там один
    процесс, а SQL-функции такой нет.
    """
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        # Пара чисел задаёт собственное пространство ключей: 4227 — «доски
        # CRM», второе — номер сотрудника. Блокировка живёт до конца
        # транзакции (суффикс _xact) и отпускается сама.
        await session.execute(
            text("SELECT pg_advisory_xact_lock(4227, :owner_id)"), {"owner_id": owner_id}
        )
    existing = await session.execute(select(Stage.id).where(Stage.owner_id == owner_id).limit(1))
    if existing.first() is not None:
        return
    session.add_all(
        Stage(name=name, color=color, sequence=index, owner_id=owner_id)
        for index, (name, color) in enumerate(DEFAULT_STAGES, start=1)
    )
    if commit:
        await session.commit()
    else:
        await session.flush()


async def board_stage_for(session: AsyncSession, owner_id: int, name: str | None) -> Stage:
    """Этап доски сотрудника: с тем же названием, иначе первый.

    Нужен при передаче карточки другому человеку. Этапы личные, поэтому
    оставить прежний stage_id нельзя — лид оказался бы на колонке, которой нет
    на доске получателя, и просто пропал бы из интерфейса.
    """
    await ensure_default_stages(session, owner_id)
    stages = list(
        (
            await session.execute(
                select(Stage).where(Stage.owner_id == owner_id).order_by(Stage.sequence, Stage.id)
            )
        ).scalars()
    )
    if name:
        for stage in stages:
            if stage.name == name:
                return stage
    return stages[0]


async def owned_stage(session: AsyncSession, stage_id: int, user: User) -> Stage:
    """Этап сотрудника: чужой доступен только администратору."""
    stage = await session.get(Stage, stage_id)
    if stage is None:
        raise NotFoundError(f"Этап {stage_id} не найден")
    if stage.owner_id != user.id and user.role != Role.admin:
        raise PermissionDeniedError("Этап принадлежит другому сотруднику")
    return stage


async def delete_stage(
    session: AsyncSession, user: User, stage_id: int, fallback_stage_id: int | None
) -> None:
    """Удаление этапа: карточки из него обязаны переехать на другую колонку.

    Живёт в сервисе (а не в роутере), потому что это транзакция из трёх
    шагов: перенос лидов, запись переноса в их ленту и удаление самой
    колонки (ревью 03.10, Б-18 и Б-24).
    """
    stage = await owned_stage(session, stage_id, user)

    leads = list(
        (await session.execute(select(Lead).where(Lead.stage_id == stage_id))).unique().scalars()
    )
    if leads:
        if fallback_stage_id is None or fallback_stage_id == stage_id:
            raise AppError(
                "В этапе есть лиды — укажите fallback_stage_id для их переноса",
                code="stage_not_empty",
            )
        # Переносить можно только в этап той же доски, иначе лид уедет к коллеге.
        fallback = await session.get(Stage, fallback_stage_id)
        if fallback is None or fallback.owner_id != stage.owner_id:
            raise NotFoundError(f"Этап {fallback_stage_id} не найден на этой доске")
        for lead in leads:
            lead.stage_id = fallback_stage_id
            advance_lead_version(lead)
            # Перенос попадает в ленту карточки: без записи смена колонки
            # происходила бы молча и её было бы не найти в истории (Б-18).
            session.add(
                TimelineEntry(
                    lead_id=lead.id,
                    author_id=user.id,
                    type=EntryType.history,
                    field_label=LEAD_STAGE_LABEL,
                    old_value=stage.name,
                    new_value=fallback.name,
                )
            )
        # ВАЖНО: записываем перенос в базу ДО удаления этапа. Без этого
        # SQLAlchemy при удалении родителя сам «отцепляет» его лиды —
        # выставляет leads.stage_id = NULL, — и база отвергает запись
        # (колонка обязательная). Снаружи это выглядело как ошибка
        # «Запись с такими данными уже существует» на обычном удалении
        # непустой колонки канбана.
        await session.flush()

    await session.delete(stage)
    await session.commit()


async def stage_on_board(session: AsyncSession, stage_id: int, board_owner_id: int) -> Stage:
    """Этап, который точно принадлежит доске конкретного сотрудника.

    Используется там, где нельзя просто довериться присланному stage_id
    (например, PATCH лида меняет этап) — лиды личных досок не должны
    оказываться на колонке чужой доски, иначе карточка пропадёт из
    интерфейса и у владельца, и у того, чья это доска на самом деле.
    """
    stage = await session.get(Stage, stage_id)
    if stage is None or stage.owner_id != board_owner_id:
        raise NotFoundError(f"Этап {stage_id} не найден на этой доске")
    return stage
