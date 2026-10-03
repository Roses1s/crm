"""Этапы канбана."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status
from sqlalchemy import select

from app.api.deps import CurrentUser, SessionDep
from app.core.errors import AppError, NotFoundError, PermissionDeniedError
from app.models.crm import Lead, Stage
from app.models.user import Role
from app.schemas.crm import StageCreate, StageRead, StageReorder, StageUpdate
from app.services.stages import ensure_default_stages, owned_stage

router = APIRouter(prefix="/crm/stages", tags=["crm: этапы"])


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


@router.post("/reorder", response_model=list[StageRead], summary="Изменить порядок этапов")
async def reorder_stages(
    payload: StageReorder, session: SessionDep, user: CurrentUser
) -> list[Stage]:
    """Сохраняет полный порядок только одной доступной пользователю доски."""
    stages = list(
        (await session.execute(select(Stage).where(Stage.id.in_(payload.stage_ids)))).scalars()
    )
    if len(stages) != len(payload.stage_ids):
        raise NotFoundError("Один или несколько этапов не найдены")

    owner_ids = {stage.owner_id for stage in stages}
    if len(owner_ids) != 1:
        raise AppError(
            "Этапы должны принадлежать одной доске",
            code="stages_from_different_boards",
        )
    board_owner = owner_ids.pop()
    if board_owner != user.id and user.role != Role.admin:
        raise PermissionDeniedError("Этапы принадлежат другому сотруднику")

    board_stages = list(
        (await session.execute(select(Stage).where(Stage.owner_id == board_owner))).scalars()
    )
    if {stage.id for stage in board_stages} != set(payload.stage_ids):
        raise AppError(
            "Передайте полный порядок этапов доски",
            code="incomplete_stage_order",
        )

    by_id = {stage.id: stage for stage in board_stages}
    for sequence, stage_id in enumerate(payload.stage_ids, start=1):
        by_id[stage_id].sequence = sequence

    await session.commit()
    return [by_id[stage_id] for stage_id in payload.stage_ids]


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
        # ВАЖНО: записываем перенос в базу ДО удаления этапа. Без этого
        # SQLAlchemy при удалении родителя сам «отцепляет» его лиды —
        # выставляет leads.stage_id = NULL, — и база отвергает запись
        # (колонка обязательная). Снаружи это выглядело как ошибка
        # «Запись с такими данными уже существует» на обычном удалении
        # непустой колонки канбана.
        await session.flush()

    await session.delete(stage)
    await session.commit()
