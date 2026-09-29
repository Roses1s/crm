from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel


class CarrierRead(ORMModel):
    id: int
    name: str
    inn: str
    is_active: bool


class CarrierCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    inn: str = Field(min_length=10, max_length=12)
    is_active: bool = True


class CarrierUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    inn: str | None = Field(default=None, min_length=10, max_length=12)
    is_active: bool | None = None
