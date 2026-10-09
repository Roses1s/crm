"""Постраничная выдача.

Формат ответа намеренно совпадает с тем, что ожидает фронтенд:
{"count": 42, "next": null, "previous": null, "results": [...]}.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")

MAX_PAGE_SIZE = 500


@dataclass(slots=True)
class PageParams:
    page: int
    page_size: int

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size


def page_params(
    page: int = Query(1, ge=1, le=10000, description="Номер страницы"),
    page_size: int = Query(50, ge=1, le=MAX_PAGE_SIZE, description="Размер страницы"),
) -> PageParams:
    return PageParams(page=page, page_size=page_size)


class Page(BaseModel, Generic[T]):
    count: int
    next: int | None = None
    previous: int | None = None
    results: list[T]


async def paginate(
    session: AsyncSession,
    statement: Select[T],
    params: PageParams,
) -> tuple[list[T], int]:
    """Возвращает срез записей и общее количество."""
    total_stmt = select(func.count()).select_from(statement.order_by(None).subquery())
    total = int((await session.execute(total_stmt)).scalar_one())
    # Не отправляем в БД заведомо пустую страницу с огромным OFFSET.
    if params.offset >= total:
        return [], total
    rows = (
        (await session.execute(statement.limit(params.page_size).offset(params.offset)))
        .scalars()
        .unique()
        .all()
    )
    return list(rows), total


def build_page(items: list[T], total: int, params: PageParams) -> dict[str, object]:
    return {
        "count": total,
        "next": params.page + 1 if params.offset + params.page_size < total else None,
        "previous": params.page - 1 if params.page > 1 else None,
        "results": items,
    }
