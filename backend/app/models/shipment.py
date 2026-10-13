from __future__ import annotations

import enum
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    Date,
    Enum,
    ForeignKey,
    Index,
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
    new = "new"  # Только создана
    checked = "checked"  # Заявка проверена и подписана
    loaded = "loaded"  # Машина прошла загрузку
    unloaded = "unloaded"  # Машина прошла выгрузку


class TransportType(enum.StrEnum):
    ft_20 = "ft_20"
    ft_40 = "ft_40"
    ref = "ref"
    tent = "tent"
    gazel = "gazel"
    other = "other"


class TaxRate(enum.StrEnum):
    """Ставка НДС в позиции заказа — у заказчика и перевозчика выбирается независимо."""

    vat_22 = "vat_22"  # Ставка НДС 22%
    no_vat = "no_vat"  # НДС не применяется
    vat_0 = "vat_0"  # Ставка НДС 0%


# Показываемая маржа уменьшается на фиксированную долю — это решение
# владельца (дополнительные расходы и комиссия вне НДС). Дубликат константы
# на фронтенде (MARGIN_DEDUCTION_RATE в ShipmentFormPage.tsx) нужен для
# живого пересчёта в карточке: менять значение только синхронно в обоих
# местах, иначе сервер и карточка покажут разную маржу.
MARGIN_DEDUCTION_RATE = Decimal("0.25")

# Действующие ставки НДС в процентах: единый справочник для расчётов.
_TAX_RATE_PERCENT: dict[TaxRate, Decimal] = {
    TaxRate.vat_22: Decimal("22"),
    TaxRate.no_vat: Decimal("0"),
    TaxRate.vat_0: Decimal("0"),
}


def net_divisor(tax: TaxRate) -> Decimal:
    """На что делить цену с НДС, чтобы получить цену без НДС: 1 + ставка/100.

    Публичная, потому что нужна и в Python (``net_amount``), и в SQL-выражении
    итогов списка заявок (``services/shipments.py``) — делитель один и тот же.
    """
    return Decimal(1) + _TAX_RATE_PERCENT[tax] / Decimal(100)


def net_amount(price: Decimal | None, tax: TaxRate) -> Decimal | None:
    """Цена без НДС: price / (1 + ставка/100).

    Промежуточных округлений нет — до копеек округляется только итог
    (margin), как в живом расчёте карточки.
    """
    if price is None:
        return None
    rate = _TAX_RATE_PERCENT[tax]
    if rate == 0:
        return price
    return price / net_divisor(tax)


def visible_margin(
    customer_price: Decimal | None,
    customer_tax: TaxRate,
    carrier_price: Decimal | None,
    carrier_tax: TaxRate,
) -> Decimal | None:
    """Маржа для показа: разница цен без НДС за вычетом фиксированной доли.

    Нет любой из цен — маржи нет (в списке покажем прочерк).
    """
    customer_net = net_amount(customer_price, customer_tax)
    carrier_net = net_amount(carrier_price, carrier_tax)
    if customer_net is None or carrier_net is None:
        return None
    exact = (customer_net - carrier_net) * (Decimal(1) - MARGIN_DEDUCTION_RATE)
    return exact.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _enum(kind: type[enum.Enum]) -> Enum:
    return Enum(kind, native_enum=False, length=20, values_callable=lambda e: [x.value for x in e])


class Shipment(Base, TimestampMixin):
    """Заявка на перевозку."""

    __tablename__ = "shipments"
    # Составной ключ связывает дочерние записи (ленту и вложения) не просто
    # с существующей заявкой, а с конкретной парой «заявка + её лид». Так
    # сама база не допускает, чтобы lead_id у дочерней записи разошёлся
    # с лидом заявки.
    # Индекс обеспечивает сортировку списка по убыванию created_at без
    # полной сортировки таблицы (ревью 06.10, М-03).
    __table_args__ = (
        UniqueConstraint("id", "lead_id", name="uq_shipments_id_lead_id"),
        UniqueConstraint("number", name="uq_shipments_number"),
        Index("ix_shipments_created_at", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Номер — видимый пользователю идентификатор заявки; в отличие от id,
    # его можно изменить. По умолчанию номер равен id, а если такой текст
    # уже занят, к нему добавляется суффикс. Уникальность гарантирует база.
    number: Mapped[str] = mapped_column(String(40), default="", nullable=False)
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

    # --- Позиция заказа: одна строка «ТЭО», цена заказчика и цена
    # перевозчика задаются отдельно, у каждой своя ставка НДС ---
    customer_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    customer_tax: Mapped[TaxRate] = mapped_column(
        _enum(TaxRate), default=TaxRate.vat_22, nullable=False
    )
    carrier_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    carrier_tax: Mapped[TaxRate] = mapped_column(
        _enum(TaxRate), default=TaxRate.vat_22, nullable=False
    )

    # --- Заказчик: шапка заявки ---
    customer_address: Mapped[str] = mapped_column(Text, default="", nullable=False)
    customer_contact: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    customer_signer: Mapped[str] = mapped_column(String(255), default="", nullable=False)

    # --- Погрузка: несколько городов задаются списком тегов ---
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

    # --- Перевозчик: справочника нет, данные вписываются текстом прямо
    # в заявку (компания, ИНН, контакт). Проверок на дубли между заявками
    # сознательно нет: перевозчик здесь не сущность системы, а текст,
    # который вводит продавец ---
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
    # Теги заявки в базе сохранены, но с 03.10.2026 в карточке не
    # показываются (решение владельца). Форма значения не изменяет и не
    # очищает: они продолжают храниться и передаваться как есть.
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
        # Маршрут в списке собираем из городов-тегов погрузки и выгрузки:
        # отдельным полем он в базе не хранится.
        start = ", ".join(self.loading_cities)
        end = ", ".join(self.unloading_cities)
        if start and end:
            return f"{start} → {end}"
        return start or end or "—"

    # --- Расчёты для списка: «Маржу» и «Всего» считает сервер, чтобы
    # формула существовала в одном месте и фронтенд её не дублировал ---
    @property
    def margin(self) -> Decimal | None:
        return visible_margin(
            self.customer_price, self.customer_tax, self.carrier_price, self.carrier_tax
        )

    @property
    def customer_total(self) -> Decimal | None:
        """Цена заказчика как введена — с НДС (колонка «Всего")."""
        return self.customer_price
