"""Этапы канбана."""

from __future__ import annotations

from fastapi import APIRouter, status
from sqlalchemy import select

from app.api.deps import CurrentUser, ManagerUser, SessionDep
from app.core.errors import AppError, NotFoundError
from app.models.crm import Lead, Stage
from app.schemas.crm import StageCreate, StageRead, StageUpdate

router = APIRouter(prefix="/crm/stages", tags=["crm: этапы"])


@router.get("", response_model=list[StageRead], summary="Все этапы по порядку")
async def list_stages(session: SessionDep, _: CurrentUser) -> list[Stage]:
    stmt = select(Stage).order_by(Stage.sequence, Stage.id)
    return list((await session.execute(stmt)).scalars().all())


@router.post(
    "", response_model=StageRead, status_code=status.HTTP_201_CREATED, summary="Создать этап"
)
async def create_stage(payload: StageCreate, session: SessionDep, _: ManagerUser) -> Stage:
    stage = Stage(**payload.model_dump())
    session.add(stage)
    await session.commit()
    await session.refresh(stage)
    return stage


@router.patch("/{stage_id}", response_model=StageRead, summary="Изменить этап")
async def update_stage(
    stage_id: int, payload: StageUpdate, session: SessionDep, _: ManagerUser
) -> Stage:
    stage = await session.get(Stage, stage_id)
    if stage is None:
        raise NotFoundError(f"Этап {stage_id} не найден")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(stage, key, value)
    await session.commit()
    await session.refresh(stage)
    return stage


@router.delete("/{stage_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Удалить этап")
async def delete_stage(
    stage_id: int,
    session: SessionDep,
    _: ManagerUser,
    fallback_stage_id: int | None = None,
) -> None:
    """Удаление возможно, только если лиды из этапа есть куда перенести."""
    stage = await session.get(Stage, stage_id)
    if stage is None:
        raise NotFoundError(f"Этап {stage_id} не найден")

    leads = list(
        (await session.execute(select(Lead).where(Lead.stage_id == stage_id))).unique().scalars()
    )
    if leads:
        if fallback_stage_id is None or fallback_stage_id == stage_id:
            raise AppError(
                "В этапе есть лиды — укажите fallback_stage_id для их переноса",
                code="stage_not_empty",
            )
        if await session.get(Stage, fallback_stage_id) is None:
            raise NotFoundError(f"Этап {fallback_stage_id} не найден")
        for lead in leads:
            lead.stage_id = fallback_stage_id

    await session.delete(stage)
    await session.commit()
