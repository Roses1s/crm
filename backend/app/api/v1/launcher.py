"""Экран «Приложения»: список модулей, доступных пользователю."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.models.user import Role

router = APIRouter(prefix="/launcher", tags=["лаунчер"])

APPS: list[dict[str, Any]] = [
    {
        "id": 1,
        "slug": "crm",
        "name": "CRM",
        "description": "Лиды, воронка продаж и карточки клиентов",
        "icon": "Kanban",
        "route": "/crm",
        "min_role": Role.operator,
    },
    {
        "id": 2,
        "slug": "shipments",
        "name": "Заявки",
        "description": "Перевозки, маршруты и статусы отгрузок",
        "icon": "Package",
        "route": "/shipments",
        "min_role": Role.operator,
    },
    {
        "id": 3,
        "slug": "admin",
        "name": "Администрирование",
        "description": "Отчёты, пользователи, перевозчики, безопасность",
        "icon": "Settings",
        "route": "/admin",
        "min_role": Role.manager,
    },
]

RANK = {Role.operator: 0, Role.manager: 1, Role.admin: 2}


@router.get("/apps", summary="Приложения, доступные текущей роли")
async def list_apps(user: CurrentUser) -> list[dict[str, Any]]:
    return [app for app in APPS if RANK[user.role] >= RANK[app["min_role"]]]
