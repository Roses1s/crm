from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.shipment import ShipmentStatus, TransportType
from app.schemas.common import ORMModel


class ShipmentBase(BaseModel):
    city_loading: str = ""
    city_unloading: str = ""
    address_loading: str = ""
    address_unloading: str = ""
    contact_loading_name: str = ""
    contact_loading_phone: str = ""
    contact_unloading_name: str = ""
    contact_unloading_phone: str = ""
    transport_type: TransportType = TransportType.tent
    cargo_weight: Decimal | None = None
    cargo_volume: Decimal | None = None
    comment: str = ""


class ShipmentCreate(ShipmentBase):
    lead_id: int
    carrier_id: int | None = None


class ShipmentUpdate(BaseModel):
    lead_id: int | None = None
    carrier_id: int | None = None
    status: ShipmentStatus | None = None
    transport_type: TransportType | None = None
    city_loading: str | None = None
    city_unloading: str | None = None
    address_loading: str | None = None
    address_unloading: str | None = None
    contact_loading_name: str | None = None
    contact_loading_phone: str | None = None
    contact_unloading_name: str | None = None
    contact_unloading_phone: str | None = None
    cargo_weight: Decimal | None = None
    cargo_volume: Decimal | None = None
    comment: str | None = None


class ShipmentStatusUpdate(BaseModel):
    status: ShipmentStatus


class ShipmentRead(ORMModel):
    id: int
    lead_id: int
    lead_name: str
    status: ShipmentStatus
    transport_type: TransportType
    city_loading: str
    city_unloading: str
    route: str
    address_loading: str
    address_unloading: str
    contact_loading_name: str
    contact_loading_phone: str
    contact_unloading_name: str
    contact_unloading_phone: str
    carrier_id: int | None
    carrier_name: str | None
    cargo_weight: Decimal | None
    cargo_volume: Decimal | None
    comment: str
    created_at: datetime


class ShipmentListItem(ORMModel):
    """Укороченная схема для таблицы заявок."""

    id: int
    lead_id: int
    lead_name: str
    status: ShipmentStatus
    route: str
    carrier_id: int | None
    carrier_name: str | None
    created_at: datetime


class StatusCount(BaseModel):
    status: ShipmentStatus
    count: int = Field(ge=0)
