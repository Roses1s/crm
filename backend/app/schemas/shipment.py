from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import ClassVar

from pydantic import BaseModel, Field, field_validator

from app.core.pagination import Page
from app.models.shipment import ShipmentStatus, TaxRate, TransportType
from app.schemas.common import ORMModel, PatchModel
from app.schemas.crm import TagRead
from app.schemas.validators import validate_inn_optional


class ShipmentBase(BaseModel):
    # Номер заявки — редактируемый текст. Если значение не передано,
    # сервис подставит id, а при совпадении с занятым номером добавит
    # суффикс.
    number: str = Field(default="", max_length=40)

    # Маршрут: адреса и контакты погрузки и выгрузки; города задаются
    # списками тегов дальше по схеме.
    address_loading: str = Field(default="", max_length=255)
    address_unloading: str = Field(default="", max_length=255)
    contact_loading_name: str = Field(default="", max_length=255)
    contact_loading_phone: str = Field(default="", max_length=32)
    contact_unloading_name: str = Field(default="", max_length=255)
    contact_unloading_phone: str = Field(default="", max_length=32)
    transport_type: TransportType = TransportType.tent
    cargo_weight: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    cargo_volume: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    comment: str = ""

    # Позиция заказа: у цены заказчика и цены перевозчика своя ставка НДС.
    customer_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    customer_tax: TaxRate = TaxRate.vat_22
    carrier_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    carrier_tax: TaxRate = TaxRate.vat_22

    # Заказчик: шапка заявки.
    customer_address: str = ""
    customer_contact: str = Field(default="", max_length=255)
    customer_signer: str = Field(default="", max_length=255)

    # Погрузка.
    loading_cities: list[str] = Field(default_factory=list)
    loading_date_from: date | None = None
    loading_date_to: date | None = None
    loading_time_from: str = Field(default="", max_length=40)
    loading_time_to: str = Field(default="", max_length=40)

    # Выгрузка.
    unloading_cities: list[str] = Field(default_factory=list)
    unloading_date_from: date | None = None
    unloading_date_to: date | None = None
    unloading_time_from: str = Field(default="", max_length=40)
    unloading_time_to: str = Field(default="", max_length=40)

    # Перевозчик вписывается свободным текстом прямо в заявку, а не
    # выбирается из справочника: допустимы любые компания, ИНН и контакт.
    # Указанный ИНН проверяется контрольной суммой, но с другими записями
    # (лидами, другими заявками) не сверяется: дублей по перевозчику
    # система не отслеживает.
    carrier_name: str = Field(default="", max_length=255)
    carrier_inn: str = Field(default="", max_length=12)
    carrier_contact: str = Field(default="", max_length=255)
    vehicle: str = Field(default="", max_length=120)
    vehicle_number: str = Field(default="", max_length=40)
    has_trailer: bool = False
    trailer_number: str = Field(default="", max_length=40)
    driver_name: str = Field(default="", max_length=255)
    driver_phone: str = Field(default="", max_length=40)
    driver_passport: str = Field(default="", max_length=255)
    carrier_signer: str = Field(default="", max_length=255)

    # Груз.
    cargo_type: str = Field(default="", max_length=255)
    cargo_packaging: str = Field(default="", max_length=255)
    capacity: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    body_type: list[str] = Field(default_factory=list)
    loading_method: list[str] = Field(default_factory=list)

    tag_ids: list[int] = Field(default_factory=list)

    _validate_carrier_inn = field_validator("carrier_inn")(staticmethod(validate_inn_optional))


class ShipmentCreate(ShipmentBase):
    lead_id: int
    # Дата создания разрешена к правке: заявку нередко заводят позже, чем
    # она возникла (задним числом), и в списке она должна стоять по
    # настоящей дате, а не по дате ввода в CRM. Если значение не передано,
    # его ставит сама база (create_shipment: при None поля нет в INSERT).
    created_at: datetime | None = None


class ShipmentUpdate(PatchModel):
    # Системный статус обычным PATCH не меняется: для него есть отдельная
    # ручка, которая обязательно пишет событие в ленту. Запрет неизвестных
    # полей (PatchModel) не позволяет полю status или опечатке тихо
    # проигнорироваться с ложным ответом 200.
    #
    # Числа и даты заявки в базе необязательные: очищенное в интерфейсе
    # поле приходит явным null, и это штатный способ стереть значение.
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

    # min_length=1: номер можно не передавать (тогда он не меняется), но
    # явно переданный пустым быть не должен — иначе заявка молча потеряет
    # единственный видимый идентификатор без возможности вернуть.
    number: str | None = Field(default=None, min_length=1, max_length=40)
    lead_id: int | None = None
    # В отличие от ShipmentCreate.created_at, здесь это обычное поле:
    # раз оно передано явно (exclude_unset), значит, его и меняем.
    created_at: datetime | None = None
    transport_type: TransportType | None = None
    address_loading: str | None = Field(default=None, max_length=255)
    address_unloading: str | None = Field(default=None, max_length=255)
    contact_loading_name: str | None = Field(default=None, max_length=255)
    contact_loading_phone: str | None = Field(default=None, max_length=32)
    contact_unloading_name: str | None = Field(default=None, max_length=255)
    contact_unloading_phone: str | None = Field(default=None, max_length=32)
    cargo_weight: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    cargo_volume: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    comment: str | None = None

    customer_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    customer_tax: TaxRate | None = None
    carrier_price: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    carrier_tax: TaxRate | None = None

    customer_address: str | None = None
    customer_contact: str | None = Field(default=None, max_length=255)
    customer_signer: str | None = Field(default=None, max_length=255)

    loading_cities: list[str] | None = None
    loading_date_from: date | None = None
    loading_date_to: date | None = None
    loading_time_from: str | None = Field(default=None, max_length=40)
    loading_time_to: str | None = Field(default=None, max_length=40)

    unloading_cities: list[str] | None = None
    unloading_date_from: date | None = None
    unloading_date_to: date | None = None
    unloading_time_from: str | None = Field(default=None, max_length=40)
    unloading_time_to: str | None = Field(default=None, max_length=40)

    carrier_name: str | None = Field(default=None, max_length=255)
    carrier_inn: str | None = Field(default=None, max_length=12)
    carrier_contact: str | None = Field(default=None, max_length=255)
    vehicle: str | None = Field(default=None, max_length=120)
    vehicle_number: str | None = Field(default=None, max_length=40)
    has_trailer: bool | None = None
    trailer_number: str | None = Field(default=None, max_length=40)
    driver_name: str | None = Field(default=None, max_length=255)
    driver_phone: str | None = Field(default=None, max_length=40)
    driver_passport: str | None = Field(default=None, max_length=255)
    carrier_signer: str | None = Field(default=None, max_length=255)

    cargo_type: str | None = Field(default=None, max_length=255)
    cargo_packaging: str | None = Field(default=None, max_length=255)
    capacity: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
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
    # Колонки «Маржа» и «Всего» присылает сервер (расчёт в
    # models/shipment.py): формула живёт в одном месте и на фронтенде
    # не дублируется.
    margin: Decimal | None
    customer_total: Decimal | None  # цена заказчика в том виде, как введена (с НДС)


class ShipmentTotals(BaseModel):
    """Итоги для строки «Итого» внизу таблицы заявок.

    Считаются по всем заявкам, подходящим под фильтр, а не только по текущей
    странице: список показывает первые N записей, а итоги обязаны быть честными.
    """

    margin: Decimal
    customer_total: Decimal


class ShipmentPage(Page[ShipmentListItem]):
    """Страница списка заявок с итогами по всему фильтру."""

    totals: ShipmentTotals
