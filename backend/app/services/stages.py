"""Бизнес-логика этапов канбана (личные доски сотрудников).

Раньше эти функции жили прямо в `app.api.v1.stages`, и `app.services.leads`
импортировал их оттуда — сервисный слой тянул зависимость из HTTP-слоя, хотя
должно быть наоборот. Здесь — чистая бизнес-логика без FastAPI; роутер
`api/v1/stages.py` импортирует её для своих ручек.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, PermissionDeniedError
from app.models.crm import Stage
from app.models.user import Role, User

# Набор, с которого начинает каждый менеджер. Дальше он правит его под себя:
# переименовывает, двигает, удаляет — у коллег доска не меняется.
DEFAULT_STAGES: list[tuple[str, str]] = [
    ("Новый", "slate"),
    ("Перезвонить", "orange"),
    ("Вышел на ЛПР", "blue"),
    ("Потенциальный клиент", "purple"),
    ("Уехали, ждём заявку", "green"),
]


async def ensure_default_stages(session: AsyncSession, owner_id: int) -> None:
    """Создаёт стандартную воронку, если у сотрудника ещё нет ни одного этапа."""
    existing = await session.execute(select(Stage.id).where(Stage.owner_id == owner_id).limit(1))
    if existing.first() is not None:
        return
    session.add_all(
        Stage(name=name, color=color, sequence=index, owner_id=owner_id)
        for index, (name, color) in enumerate(DEFAULT_STAGES, start=1)
    )
    await session.commit()


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
