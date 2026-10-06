"""Сборка всех маршрутов версии v1."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import (
    admin,
    attachments,
    auth,
    customers,
    launcher,
    leads,
    loss_reasons,
    meta,
    shipments,
    stages,
    tags,
    users,
)

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(launcher.router)
api_router.include_router(stages.router)
api_router.include_router(tags.router)
api_router.include_router(loss_reasons.router)
api_router.include_router(meta.router)
api_router.include_router(leads.router)
api_router.include_router(customers.router)
api_router.include_router(attachments.router)
api_router.include_router(shipments.router)
api_router.include_router(attachments.shipment_router)
api_router.include_router(users.router)
api_router.include_router(admin.router)
