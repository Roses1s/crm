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
        "min_role": Role.manager,
    },
    {
        "id": 2,
        "slug": "shipments",
        "name": "Заявки",
        "description": "Перевозки, маршруты и статусы отгрузок",
        "icon": "Package",
        "route": "/shipments",
        "min_role": Role.manager,
    },
    {
        "id": 4,
        "slug": "customers",
        "name": "Клиенты",
        "description": "Все клиенты компании: кто ведёт и кто уже проигран",
        "icon": "Users",
        "route": "/customers",
        "min_role": Role.manager,
    },
    {
        "id": 3,
        "slug": "admin",
        "name": "Администрирование",
        "description": "Пользователи, бэкапы, безопасность",
        "icon": "Settings",
        "route": "/admin",
        "min_role": Role.admin,
    },
    {
        "id": 5,
        "slug": "accounting",
        "name": "Бухгалтерия",
        "description": "Счета, банк и кассовые операции — раздел в разработке",
        "icon": "Landmark",
        "route": "/accounting",
        "min_role": Role.manager,
    },
]

RANK = {Role.manager: 0, Role.admin: 1}


@router.get("/apps", summary="Приложения, доступные текущей роли")
async def list_apps(user: CurrentUser) -> list[dict[str, Any]]:
    return [app for app in APPS if RANK[user.role] >= RANK[app["min_role"]]]
