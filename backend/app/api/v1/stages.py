"""Этапы канбана."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, SessionDep
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.models.crm import Lead, Stage
from app.models.user import Role, User
from app.schemas.crm import StageCreate, StageRead, StageUpdate

router = APIRouter(prefix="/crm/stages", tags=["crm: этапы"])

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


@router.get("", response_model=list[StageRead], summary="Этапы доски по порядку")
async def list_stages(
    session: SessionDep,
    user: CurrentUser,
    owner_id: Annotated[
        int | None, Query(description="Чью доску открыть — только для администратора")
    ] = None,
) -> list[Stage]:
    board_owner = user.id
    if owner_id is not None and owner_id != user.id:
        if user.role != Role.admin:
            raise PermissionDeniedError("Чужую доску может открыть только администратор")
        board_owner = owner_id

    # Первый заход на доску: этапов ещё нет — создаём стандартную воронку.
    await ensure_default_stages(session, board_owner)
    stmt = select(Stage).where(Stage.owner_id == board_owner).order_by(Stage.sequence, Stage.id)
    return list((await session.execute(stmt)).scalars().all())


@router.post(
    "", response_model=StageRead, status_code=status.HTTP_201_CREATED, summary="Создать этап"
)
async def create_stage(
    payload: StageCreate,
    session: SessionDep,
    user: CurrentUser,
    owner_id: Annotated[int | None, Query(description="Доска сотрудника (админ)")] = None,
) -> Stage:
    board_owner = user.id
    if owner_id is not None and owner_id != user.id:
        if user.role != Role.admin:
            raise PermissionDeniedError("Создавать этапы на чужой доске может только администратор")
        board_owner = owner_id
    stage = Stage(**payload.model_dump(), owner_id=board_owner)
    session.add(stage)
    await session.commit()
    await session.refresh(stage)
    return stage


@router.patch("/{stage_id}", response_model=StageRead, summary="Изменить этап")
async def update_stage(
    stage_id: int, payload: StageUpdate, session: SessionDep, user: CurrentUser
) -> Stage:
    stage = await owned_stage(session, stage_id, user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(stage, key, value)
    await session.commit()
    await session.refresh(stage)
    return stage


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить этап")
async def delete_stage(
    stage_id: int,
    session: SessionDep,
    user: CurrentUser,
    fallback_stage_id: int | None = None,
) -> None:
    """Удаление возможно, только если лиды из этапа есть куда перенести."""
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

    await session.delete(stage)
    await session.commit()
