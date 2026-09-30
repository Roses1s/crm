from __future__ import annotations

import enum
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.carrier import Carrier
    from app.models.crm import Lead


class ShipmentStatus(enum.StrEnum):
    new = "new"  # Новая
    checked = "checked"  # Проверена и подписана заявка
    loaded = "loaded"  # Машина загрузилась
    unloaded = "unloaded"  # Машина выгрузилась


class TransportType(enum.StrEnum):
    ft_20 = "ft_20"
    ft_40 = "ft_40"
    ref = "ref"
    tent = "tent"
    gazel = "gazel"
    other = "other"


def _enum(kind: type[enum.Enum]) -> Enum:
    return Enum(kind, native_enum=False, length=20, values_callable=lambda e: [x.value for x in e])


class Shipment(Base, TimestampMixin):
    """Заявка на перевозку."""

    __tablename__ = "shipments"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    carrier_id: Mapped[int | None] = mapped_column(
        ForeignKey("carriers.id", ondelete="SET NULL"), index=True
    )

    status: Mapped[ShipmentStatus] = mapped_column(
        _enum(ShipmentStatus), default=ShipmentStatus.new, nullable=False, index=True
    )
    transport_type: Mapped[TransportType] = mapped_column(
        _enum(TransportType), default=TransportType.tent, nullable=False
    )

    city_loading: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    city_unloading: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    address_loading: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    address_unloading: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    contact_loading_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    contact_loading_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    contact_unloading_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    contact_unloading_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)

    cargo_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    cargo_volume: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)

    lead: Mapped[Lead] = relationship(back_populates="shipments", lazy="joined")
    carrier: Mapped[Carrier | None] = relationship(back_populates="shipments", lazy="joined")

    @property
    def lead_name(self) -> str:
        return self.lead.name if self.lead else ""

    @property
    def carrier_name(self) -> str | None:
        return self.carrier.name if self.carrier else None

    @property
    def seller_name(self) -> str | None:
        """Продавец заявки — это ответственный за лид."""
        return self.lead.assigned_to_name if self.lead else None

    @property
    def route(self) -> str:
        if self.city_loading and self.city_unloading:
            return f"{self.city_loading} → {self.city_unloading}"
        return self.city_loading or self.city_unloading or "—"
