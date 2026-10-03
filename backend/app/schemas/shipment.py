from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator

from app.models.shipment import ShipmentStatus, TaxRate, TransportType
from app.schemas.common import ORMModel, PatchModel
from app.schemas.crm import TagRead
from app.schemas.validators import validate_inn_optional


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

    # Перевозчик — свободный текст прямо в заявке, а не выбор из справочника:
    # его можно вписать любого, с любой компанией/ИНН/контактом. ИНН (если
    # указан) проверяется контрольной суммой, но ни с какими другими
    # записями (лидами, другими заявками) не сверяется — пересечений и
    # дублей по перевозчику в системе больше нет.
    carrier_name: str = Field(default="", max_length=255)
    carrier_inn: str = ""
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

    _validate_carrier_inn = field_validator("carrier_inn")(staticmethod(validate_inn_optional))


class ShipmentCreate(ShipmentBase):
    lead_id: int
    # Дата создания редактируема: заявку часто заводят в системе позже, чем
    # она реально возникла (задним числом), и нужно видеть её в списке по
    # настоящей дате, а не по дате ввода в CRM. Не передано — ставит сама БД
    # (см. create_shipment: при None поле не попадает в INSERT).
    created_at: datetime | None = None


class ShipmentUpdate(PatchModel):
    # Обычный PATCH не меняет системный статус: для этого есть отдельная ручка,
    # которая обязательно пишет событие в ленту. Запрет неизвестных полей
    # (из PatchModel) не даёт полю status или опечатке тихо проигнорироваться
    # с ложным 200.
    #
    # Числа и даты в заявке в базе необязательные: интерфейс присылает им
    # явный null, когда поле очистили, — это штатный способ стереть значение.
    nullable_fields: ClassVar[frozenset[str]] = frozenset(
        {
            "cargo_weight",
            "cargo_volume",
            "capacity",
            "customer_price",
            "carrier_price",
            "loading_date_from",
            "loading_date_to",
            "unloading_date_from",
            "unloading_date_to",
        }
    )

    # min_length=1 — номер можно не передавать (тогда он не меняется), но
    # если передан явно, пустым быть не должен: иначе заявка молча теряет
    # свой единственный видимый идентификатор без возможности откатить.
    number: str | None = Field(default=None, min_length=1, max_length=40)
    lead_id: int | None = None
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

    carrier_name: str | None = Field(default=None, max_length=255)
    carrier_inn: str | None = None
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

    _validate_carrier_inn = field_validator("carrier_inn")(staticmethod(validate_inn_optional))


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

    carrier_name: str
    carrier_inn: str
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
    carrier_name: str
    created_at: datetime


class StatusCount(BaseModel):
    status: ShipmentStatus
    count: int = Field(ge=0)
