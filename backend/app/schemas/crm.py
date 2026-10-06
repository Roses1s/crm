from __future__ import annotations

import re
from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.timeline import EntryType
from app.schemas.common import ORMModel, PatchModel
from app.schemas.validators import validate_inn


# --- этапы -------------------------------------------------------------------
class StageRead(ORMModel):
    id: int
    name: str
    sequence: int
    color: str


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sequence: int = 0
    color: str = "purple"


class StageUpdate(PatchModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sequence: int | None = None
    color: str | None = None


class StageReorder(BaseModel):
    """Полный порядок этапов одной доски после горизонтального перетаскивания."""

    stage_ids: list[int] = Field(min_length=1)

    @field_validator("stage_ids")
    @classmethod
    def stage_ids_are_unique(cls, value: list[int]) -> list[int]:
        """Один этап в новом порядке нельзя передать дважды."""
        if len(value) != len(set(value)):
            raise ValueError("Каждый этап должен встречаться в порядке один раз")
        return value


# --- теги --------------------------------------------------------------------
# Цвет — HEX (#rrggbb): тег можно покрасить в любой цвет, а не только в одну
# из заранее заготовленных палитр.
_HEX_COLOR_RE = r"^#[0-9a-fA-F]{6}$"


def _validate_hex_color(value: str) -> str:
    if not re.fullmatch(_HEX_COLOR_RE, value):
        raise ValueError("Цвет должен быть в формате HEX, например #3B82F6")
    return value.lower()


class TagRead(ORMModel):
    id: int
    name: str
    color: str


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = "#3B82F6"

    @field_validator("color")
    @classmethod
    def _color_is_hex(cls, value: str) -> str:
        return _validate_hex_color(value)


class TagUpdate(PatchModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = None

    @field_validator("color")
    @classmethod
    def _color_is_hex(cls, value: str | None) -> str | None:
        return _validate_hex_color(value) if value is not None else None


# --- причины проигрыша --------------------------------------------------------
class LossReasonRead(ORMModel):
    id: int
    name: str


class LossReasonCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


# --- лиды --------------------------------------------------------------------
class LeadBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    inn: str = Field(min_length=10, max_length=12)
    logist_contact: str = ""
    logist_phone: str = ""
    logist_email: EmailStr | None = None
    priority: int = Field(default=0, ge=0, le=3)

    _validate_inn = field_validator("inn")(staticmethod(validate_inn))


class LeadCreate(LeadBase):
    stage_id: int
    assigned_to_id: int | None = None
    tag_ids: list[int] = Field(default_factory=list)


class LeadTransfer(BaseModel):
    """Кому передаём карточку."""

    user_id: int


class LeadUpdate(PatchModel):
    # Почта логиста — единственное поле карточки, которое в базе
    # необязательное: его разрешено очистить, передав null.
    nullable_fields: ClassVar[frozenset[str]] = frozenset({"logist_email"})

    name: str | None = Field(default=None, min_length=1, max_length=255)
    inn: str | None = None
    logist_contact: str | None = None
    logist_phone: str | None = None
    logist_email: EmailStr | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    stage_id: int | None = None
    tag_ids: list[int] | None = None
    # is_archived сюда намеренно не входит: отметить лид проигравшим можно
    # только через POST /lose (там же обязательна причина и запись в ленту),
    # обычным сохранением формы это не делается — как и передача продавцу.

    _validate_inn = field_validator("inn")(staticmethod(validate_inn))


class LeadLose(BaseModel):
    """Тело запроса «отметить проигрышем» — причина обязательна."""

    reason_id: int


class LeadRead(ORMModel):
    id: int
    name: str
    inn: str
    logist_contact: str
    logist_phone: str
    logist_email: str | None
    priority: int
    is_archived: bool
    loss_reason_id: int | None
    loss_reason_name: str | None
    stage_id: int
    stage_name: str
    assigned_to_id: int | None
    assigned_to_email: str | None
    assigned_to_name: str | None
    tags: list[TagRead]
    created_at: datetime
    updated_at: datetime


# --- клиенты (все лиды компании, с маскировкой чужих активных) ----------------
class CustomerRead(BaseModel):
    """Строка модуля «Клиенты».

    Свой лид и любой проигранный (``is_archived=True``) открыты полностью —
    у них ``can_open=True``. Чужой активный лид виден только базово: название,
    ИНН и кто ведёт, остальные поля приходят пустыми, карточку открыть нельзя.
    """

    id: int
    name: str
    inn: str
    assigned_to_id: int | None
    assigned_to_name: str | None
    is_archived: bool
    can_open: bool
    loss_reason_name: str | None = None
    logist_contact: str | None = None
    logist_phone: str | None = None
    logist_email: str | None = None
    priority: int | None = None
    stage_name: str | None = None
    tags: list[TagRead] = Field(default_factory=list)
    updated_at: datetime


# --- лента -------------------------------------------------------------------
class AttachmentRead(ORMModel):
    id: int
    name: str
    size: int
    content_type: str
    uploaded_by_name: str = "—"
    created_at: datetime


class TimelineEntryRead(ORMModel):
    id: int
    type: EntryType
    author_name: str
    author_initials: str
    # Кто написал запись: по этому номеру фронтенд прячет кнопку правки
    # у чужих примечаний (менять их может только автор — ревью, Б-11).
    author_id: int | None
    body: str
    field_label: str | None
    old_value: str | None
    new_value: str | None
    # Запись о переносе карточки между этапами: её разрешено удалить,
    # остальную системную историю — нет.
    is_stage_change: bool
    created_at: datetime
    attachments: list[AttachmentRead] = Field(default_factory=list)


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class NoteUpdate(PatchModel):
    body: str = Field(min_length=1, max_length=5000)
