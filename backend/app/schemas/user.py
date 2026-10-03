from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field

from app.models.user import Role
from app.schemas.common import ORMModel, PatchModel


class UserRead(ORMModel):
    id: int
    email: EmailStr
    first_name: str
    last_name: str
    role: Role
    is_active: bool


class ColleagueRead(ORMModel):
    """Минимум о сотруднике — для выбора получателя лида."""

    id: int
    first_name: str
    last_name: str
    full_name: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = ""
    last_name: str = ""
    role: Role = Role.manager


class UserUpdate(PatchModel):
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    first_name: str | None = None
    last_name: str | None = None
    role: Role | None = None
    is_active: bool | None = None
