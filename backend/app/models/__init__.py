"""Все модели импортируются здесь, чтобы Alembic видел полную metadata."""

from app.db.base import Base
from app.models.carrier import Carrier
from app.models.crm import Lead, Stage, Tag, lead_tags
from app.models.shipment import Shipment, ShipmentStatus, TransportType
from app.models.timeline import Attachment, EntryType, TimelineEntry
from app.models.user import Role, User

__all__ = [
    "Attachment",
    "Base",
    "Carrier",
    "EntryType",
    "Lead",
    "Role",
    "Shipment",
    "ShipmentStatus",
    "Stage",
    "Tag",
    "TimelineEntry",
    "TransportType",
    "User",
    "lead_tags",
]
