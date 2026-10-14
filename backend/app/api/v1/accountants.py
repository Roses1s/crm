"""Публичный для авторизованных сотрудников список активных бухгалтеров."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser, SessionDep
from app.models.crm import Accountant
from app.schemas.crm import AccountantRead
from app.services.accountants import list_accountants

router = APIRouter(prefix="/crm/accountants", tags=["crm: бухгалтеры"])


@router.get("", response_model=list[AccountantRead], summary="Активные бухгалтеры")
async def get_accountants(session: SessionDep, _: CurrentUser) -> list[Accountant]:
    return await list_accountants(session, active_only=True)
