from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field

from app.models.shipment import ShipmentStatus, TaxRate, TransportType
from app.schemas.common import ORMModel
from app.schemas.crm import TagRead


class ShipmentBase(BaseModel):
    # Номер заявки — редактируемый пользователем текст (по умолчанию = id).
    number: str = Field(default="", max_length=40)

    # Маршрут (адреса и контакты; города — списком тегов ниже).
    address_loading: str = ""
    address_unloading: str = ""
    contact_loading_name: str = ""
    contact_loading_phone: str = ""
    contact_unloading_name: str = ""
    contact_unloading_phone: str = ""
    transport_type: TransportType = TransportType.tent
    cargo_weight: Decimal | None = Field(default=None, ge=0)
    cargo_volume: Decimal | None = Field(default=None, ge=0)
    comment: str = ""

    # Позиция заказа: цена заказчика/перевозчика, каждая со своей ставкой НДС.
    customer_price: Decimal | None = Field(default=None, ge=0)
    customer_tax: TaxRate = TaxRate.vat_22
    carrier_price: Decimal | None = Field(default=None, ge=0)
    carrier_tax: TaxRate = TaxRate.vat_22

    # Заказчик (шапка).
    customer_address: str = ""
    customer_contact: str = ""
    customer_signer: str = ""

    # Погрузка.
    loading_cities: list[str] = Field(default_factory=list)
    loading_date_from: date | None = None
    loading_date_to: date | None = None
    loading_time_from: str = ""
    loading_time_to: str = ""

    # Выгрузка.
    unloading_cities: list[str] = Field(default_factory=list)
    unloading_date_from: date | None = None
    unloading_date_to: date | None = None
    unloading_time_from: str = ""
    unloading_time_to: str = ""

    # Перевозчик.
    carrier_contact: str = ""
    vehicle: str = ""
    vehicle_number: str = ""
    has_trailer: bool = False
    trailer_number: str = ""
    driver_name: str = ""
    driver_phone: str = ""
    driver_passport: str = ""
    carrier_signer: str = ""

    # Груз.
    cargo_type: str = ""
    cargo_packaging: str = ""
    capacity: Decimal | None = Field(default=None, ge=0)
    body_type: list[str] = Field(default_factory=list)
    loading_method: list[str] = Field(default_factory=list)

    tag_ids: list[int] = Field(default_factory=list)


class ShipmentCreate(ShipmentBase):
    lead_id: int
    carrier_id: int | None = None
    # Дата создания редактируема: заявку часто заводят в системе позже, чем
    # она реально возникла (задним числом), и нужно видеть её в списке по
    # настоящей дате, а не по дате ввода в CRM. Не передано — ставит сама БД
    # (см. create_shipment: при None поле не попадает в INSERT).
    created_at: datetime | None = None


class ShipmentUpdate(BaseModel):
    # min_length=1 — номер можно не передавать (тогда он не меняется), но
    # если передан явно, пустым быть не должен: иначе заявка молча теряет
    # свой единственный видимый идентификатор без возможности откатить.
    number: str | None = Field(default=None, min_length=1, max_length=40)
    lead_id: int | None = None
    carrier_id: int | None = None
    status: ShipmentStatus | None = None
    # См. ShipmentCreate.created_at — здесь это просто обычное поле: раз
    # передано явно (exclude_unset), значит его и меняем.
    created_at: datetime | None = None
    transport_type: TransportType | None = None
    address_loading: str | None = None
    address_unloading: str | None = None
    contact_loading_name: str | None = None
    contact_loading_phone: str | None = None
    contact_unloading_name: str | None = None
    contact_unloading_phone: str | None = None
    cargo_weight: Decimal | None = Field(default=None, ge=0)
    cargo_volume: Decimal | None = Field(default=None, ge=0)
    comment: str | None = None

    customer_price: Decimal | None = Field(default=None, ge=0)
    customer_tax: TaxRate | None = None
    carrier_price: Decimal | None = Field(default=None, ge=0)
    carrier_tax: TaxRate | None = None

    customer_address: str | None = None
    customer_contact: str | None = None
    customer_signer: str | None = None

    loading_cities: list[str] | None = None
    loading_date_from: date | None = None
    loading_date_to: date | None = None
    loading_time_from: str | None = None
    loading_time_to: str | None = None

    unloading_cities: list[str] | None = None
    unloading_date_from: date | None = None
    unloading_date_to: date | None = None
    unloading_time_from: str | None = None
    unloading_time_to: str | None = None

    carrier_contact: str | None = None
    vehicle: str | None = None
    vehicle_number: str | None = None
    has_trailer: bool | None = None
    trailer_number: str | None = None
    driver_name: str | None = None
    driver_phone: str | None = None
    driver_passport: str | None = None
    carrier_signer: str | None = None

    cargo_type: str | None = None
    cargo_packaging: str | None = None
    capacity: Decimal | None = Field(default=None, ge=0)
    body_type: list[str] | None = None
    loading_method: list[str] | None = None

    tag_ids: list[int] | None = None


class ShipmentStatusUpdate(BaseModel):
    status: ShipmentStatus


class ShipmentRead(ORMModel):
    id: int
    number: str
    lead_id: int
    lead_name: str
    seller_name: str | None
    status: ShipmentStatus
    transport_type: TransportType
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

    customer_price: Decimal | None
    customer_tax: TaxRate
    carrier_price: Decimal | None
    carrier_tax: TaxRate

    customer_address: str
    customer_contact: str
    customer_signer: str

    loading_cities: list[str]
    loading_date_from: date | None
    loading_date_to: date | None
    loading_time_from: str
    loading_time_to: str

    unloading_cities: list[str]
    unloading_date_from: date | None
    unloading_date_to: date | None
    unloading_time_from: str
    unloading_time_to: str

    carrier_contact: str
    vehicle: str
    vehicle_number: str
    has_trailer: bool
    trailer_number: str
    driver_name: str
    driver_phone: str
    driver_passport: str
    carrier_signer: str

    cargo_type: str
    cargo_packaging: str
    capacity: Decimal | None
    body_type: list[str]
    loading_method: list[str]

    tags: list[TagRead] = Field(default_factory=list)

    created_at: datetime


class ShipmentListItem(ORMModel):
    """Укороченная схема для таблицы заявок."""

    id: int
    number: str
    lead_id: int
    lead_name: str
    tags: list[TagRead] = Field(default_factory=list)
    seller_name: str | None
    status: ShipmentStatus
    route: str
    carrier_id: int | None
    carrier_name: str | None
    created_at: datetime


class StatusCount(BaseModel):
    status: ShipmentStatus
    count: int = Field(ge=0)
