from __future__ import annotations

import enum
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import JSON, Boolean, Date, Enum, ForeignKey, Numeric, String, Text
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

    # --- Заказчик (шапка) ---
    customer_address: Mapped[str] = mapped_column(Text, default="", nullable=False)
    customer_contact: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    customer_signer: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    # --- Погрузка (мультигорода — список тегов) ---
    loading_cities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    loading_date_from: Mapped[date | None] = mapped_column(Date)
    loading_date_to: Mapped[date | None] = mapped_column(Date)
    loading_time_from: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    loading_time_to: Mapped[str] = mapped_column(String(40), default="", nullable=False)

    # --- Выгрузка ---
    unloading_cities: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    unloading_date_from: Mapped[date | None] = mapped_column(Date)
    unloading_date_to: Mapped[date | None] = mapped_column(Date)
    unloading_time_from: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    unloading_time_to: Mapped[str] = mapped_column(String(40), default="", nullable=False)

    # --- Перевозчик ---
    carrier_contact: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    vehicle: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    vehicle_number: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    has_trailer: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    trailer_number: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    driver_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    driver_phone: Mapped[str] = mapped_column(String(40), default="", nullable=False)
    driver_passport: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    carrier_signer: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    # --- Груз ---
    cargo_type: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    cargo_packaging: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    capacity: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    body_type: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    loading_method: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)

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
        # Маршрут для списка: сначала берём мультигорода-теги, иначе — старые
        # одиночные поля города.
        start = ", ".join(self.loading_cities) if self.loading_cities else self.city_loading
        end = ", ".join(self.unloading_cities) if self.unloading_cities else self.city_unloading
        if start and end:
            return f"{start} → {end}"
        return start or end or "—"
