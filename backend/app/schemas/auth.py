from __future__ import annotations

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AccessToken(BaseModel):
    """Ответ входа и обновления.

    Обновляющий токен в теле не возвращается: он уходит в куку HttpOnly,
    недоступную скриптам страницы. Так украсть сессию через чужой скрипт
    нельзя, а короткий токен доступа живёт только в памяти вкладки.
    """

    access_token: str
    token_type: str = "bearer"
    expires_in: int
