from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import Role
from app.schemas.common import ORMModel, PatchModel


class UserRead(ORMModel):
    id: int
    email: EmailStr = Field(max_length=255)
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


# bcrypt учитывает только первые 72 БАЙТА пароля, остальное молча отбрасывает.
# Для кириллицы это примерно 36 символов. Раньше схема разрешала 128 символов,
# и два разных длинных пароля могли оказаться для системы одинаковыми.
MAX_PASSWORD_BYTES = 72


def _password_fits_bcrypt(value: str) -> str:
    if len(value.encode("utf-8")) > MAX_PASSWORD_BYTES:
        raise ValueError(
            "Пароль слишком длинный: не больше 72 байт "
            "(примерно 72 латинских или 36 кириллических символов)"
        )
    return value


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    first_name: str = Field(default="", max_length=100)
    last_name: str = Field(default="", max_length=100)
    role: Role = Role.manager

    _password_length = field_validator("password")(staticmethod(_password_fits_bcrypt))


class UserUpdate(PatchModel):
    email: EmailStr | None = Field(default=None, max_length=255)
    password: str | None = Field(default=None, min_length=8, max_length=128)
    first_name: str | None = Field(default=None, max_length=100)
    last_name: str | None = Field(default=None, max_length=100)
    role: Role | None = None
    is_active: bool | None = None

    _password_length = field_validator("password")(staticmethod(_password_fits_bcrypt))
