from __future__ import annotations

import enum
from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    Enum,
    ForeignKey,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.crm import Tag

if TYPE_CHECKING:
    from app.models.crm import Lead


shipment_tags = Table(
    "shipment_tags",
    Base.metadata,
    Column("shipment_id", ForeignKey("shipments.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


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


class TaxRate(enum.StrEnum):
    """Ставка НДС в позиции заказа — у заказчика и перевозчика выбирается независимо."""

    vat_22 = "vat_22"  # НДС 22%
    no_vat = "no_vat"  # Без НДС
    vat_0 = "vat_0"  # НДС 0%


def _enum(kind: type[enum.Enum]) -> Enum:
    return Enum(kind, native_enum=False, length=20, values_callable=lambda e: [x.value for x in e])


class Shipment(Base, TimestampMixin):
    """Заявка на перевозку."""

    __tablename__ = "shipments"
    # Составной ключ нужен дочерним строкам заявки: timeline/attachments
    # обязаны ссылаться не просто на существующую заявку, а на ту же пару
    # «заявка + лид». Так БД сама не допускает рассинхронизацию lead_id.
    __table_args__ = (UniqueConstraint("id", "lead_id", name="uq_shipments_id_lead_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    # Номер заявки — видимый пользователю идентификатор, который можно
    # переименовать (в отличие от id). При создании по умолчанию равен id,
    # но это просто стартовое значение текстового поля, не ограничение.
    number: Mapped[str] = mapped_column(String(40), default="", nullable=False, index=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )

    status: Mapped[ShipmentStatus] = mapped_column(
        _enum(ShipmentStatus), default=ShipmentStatus.new, nullable=False, index=True
    )
    transport_type: Mapped[TransportType] = mapped_column(
        _enum(TransportType), default=TransportType.tent, nullable=False
    )

    address_loading: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    address_unloading: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    contact_loading_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    contact_loading_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    contact_unloading_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    contact_unloading_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)

    cargo_weight: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    cargo_volume: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    comment: Mapped[str] = mapped_column(Text, default="", nullable=False)

    # --- Позиция заказа: единственная строка «ТЭО», цена отдельно для
    # заказчика и для перевозчика — у каждой своя ставка НДС. ---
    customer_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    customer_tax: Mapped[TaxRate] = mapped_column(
        _enum(TaxRate), default=TaxRate.vat_22, nullable=False
    )
    carrier_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    carrier_tax: Mapped[TaxRate] = mapped_column(
        _enum(TaxRate), default=TaxRate.vat_22, nullable=False
    )

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

    # --- Перевозчик: никакого справочника — перевозчика просто вписывают
    # текстом прямо в заявку (компания, ИНН, контакт). Пересечений/проверок
    # на дубли между заявками сознательно нет — это не бизнес-сущность
    # системы, а текст, который вводит продавец. ---
    carrier_name: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    carrier_inn: Mapped[str] = mapped_column(String(12), default="", nullable=False)
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
    # Теги заявки остались в базе, но с 03.10.2026 не показываются в карточке
    # (решение владельца). Значения сохраняются как есть: форма их не трогает.
    tags: Mapped[list[Tag]] = relationship(secondary=shipment_tags, lazy="selectin")

    @property
    def lead_name(self) -> str:
        return self.lead.name if self.lead else ""

    @property
    def seller_name(self) -> str | None:
        """Продавец заявки — это ответственный за лид."""
        return self.lead.assigned_to_name if self.lead else None

    @property
    def route(self) -> str:
        # Маршрут для списка собирается из городов-тегов.
        start = ", ".join(self.loading_cities)
        end = ", ".join(self.unloading_cities)
        if start and end:
            return f"{start} → {end}"
        return start or end or "—"
