"""Сборка всех маршрутов версии v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import admin, auth, carriers, launcher, leads, shipments, stages, tags

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(launcher.router)
api_router.include_router(stages.router)
api_router.include_router(tags.router)
api_router.include_router(leads.router)
api_router.include_router(shipments.router)
api_router.include_router(carriers.router)
api_router.include_router(admin.router)
