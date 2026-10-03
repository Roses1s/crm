"""Модуль «Клиенты»: все лиды компании, доступен любому сотруднику."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep
from app.core.pagination import Page, PageParams, page_params
from app.schemas.crm import CustomerRead
from app.services import customers as service

router = APIRouter(prefix="/crm/customers", tags=["crm: клиенты"])

PageParamsDep = Annotated[PageParams, Depends(page_params)]


@router.get(
    "/by-inn",
    response_model=list[CustomerRead],
    summary="Лиды с таким же ИНН (предупреждение о дубле при создании/правке)",
)
async def customers_by_inn(
    session: SessionDep,
    user: CurrentUser,
    inn: str,
    exclude_id: Annotated[
        int | None,
        Query(description="Исключить этот id из результата — сам редактируемый лид"),
    ] = None,
) -> list[dict[str, Any]]:
    return await service.find_by_inn(session, user, inn, exclude_id=exclude_id)


@router.get("", response_model=Page[CustomerRead], summary="Все клиенты компании")
async def list_customers(
    session: SessionDep,
    user: CurrentUser,
    params: PageParamsDep,
    search: Annotated[str | None, Query(description="Поиск по названию или ИНН")] = None,
) -> dict[str, Any]:
    return await service.list_customers(session, user, params, search=search)
