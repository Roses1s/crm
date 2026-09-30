from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.timeline import EntryType
from app.schemas.common import ORMModel


# --- этапы -------------------------------------------------------------------
class StageRead(ORMModel):
    id: int
    name: str
    sequence: int
    is_closed: bool
    color: str


class StageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    sequence: int = 0
    is_closed: bool = False
    color: str = "purple"


class StageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    sequence: int | None = None
    is_closed: bool | None = None
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
class TagRead(ORMModel):
    id: int
    name: str
    color: str


class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = "blue"


# --- лиды --------------------------------------------------------------------
class LeadBase(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    inn: str = Field(min_length=10, max_length=12)
    logist_contact: str = ""
    logist_phone: str = ""
    logist_email: EmailStr | None = None
    priority: int = Field(default=0, ge=0, le=3)

    @field_validator("inn")
    @classmethod
    def validate_inn(cls, value: str) -> str:
        """ИНН: 10 или 12 цифр плюс контрольная сумма ФНС."""
        digits = "".join(ch for ch in value if ch.isdigit())
        if len(digits) not in (10, 12):
            raise ValueError("ИНН должен содержать 10 или 12 цифр")
        if not _inn_checksum_ok(digits):
            raise ValueError("Некорректный ИНН: не сходится контрольная сумма")
        return digits


class LeadCreate(LeadBase):
    stage_id: int
    assigned_to_id: int | None = None
    tag_ids: list[int] = Field(default_factory=list)


class LeadTransfer(BaseModel):
    """Кому передаём карточку."""

    user_id: int


class LeadUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    inn: str | None = None
    logist_contact: str | None = None
    logist_phone: str | None = None
    logist_email: EmailStr | None = None
    priority: int | None = Field(default=None, ge=0, le=3)
    stage_id: int | None = None
    tag_ids: list[int] | None = None
    is_archived: bool | None = None

    _validate_inn = field_validator("inn")(LeadBase.validate_inn.__func__)  # type: ignore[attr-defined]


class LeadRead(ORMModel):
    id: int
    name: str
    inn: str
    logist_contact: str
    logist_phone: str
    logist_email: str | None
    priority: int
    is_archived: bool
    stage_id: int
    stage_name: str
    assigned_to_id: int | None
    assigned_to_email: str | None
    assigned_to_name: str | None
    tags: list[TagRead]
    created_at: datetime
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
    body: str
    field_label: str | None
    old_value: str | None
    new_value: str | None
    created_at: datetime
    attachments: list[AttachmentRead] = Field(default_factory=list)


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class NoteUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


def _inn_checksum_ok(inn: str) -> bool:
    """Контрольная сумма ИНН по алгоритму ФНС."""

    def weighted(weights: list[int]) -> int:
        return sum(w * int(d) for w, d in zip(weights, inn, strict=False)) % 11 % 10

    if len(inn) == 10:
        return weighted([2, 4, 10, 3, 5, 9, 4, 6, 8]) == int(inn[9])
    first = weighted([7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
    second = weighted([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
    return first == int(inn[10]) and second == int(inn[11])
