from __future__ import annotations

from pydantic import BaseModel, Field, field_validator

from app.schemas.common import ORMModel
from app.schemas.crm import TagRead
from app.schemas.validators import validate_inn


class CarrierRead(ORMModel):
    id: int
    name: str
    inn: str
    is_active: bool
    tags: list[TagRead] = Field(default_factory=list)


class CarrierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    inn: str = Field(min_length=10, max_length=12)
    is_active: bool = True
    tag_ids: list[int] = Field(default_factory=list)

    _validate_inn = field_validator("inn")(staticmethod(validate_inn))


class CarrierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    inn: str | None = Field(default=None, min_length=10, max_length=12)
    is_active: bool | None = None

    _validate_inn = field_validator("inn")(staticmethod(validate_inn))


class CarrierTagsUpdate(BaseModel):
    """Отдельная ручка для тегов — доступна любому пользователю, в отличие от
    остальных полей перевозчика (их меняет только админ)."""

    tag_ids: list[int] = Field(default_factory=list)
