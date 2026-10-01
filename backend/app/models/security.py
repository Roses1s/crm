from __future__ import annotations

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoginAttempt(Base):
    """Журнал попыток входа — источник данных для раздела «Безопасность»."""

    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    ip_address: Mapped[str] = mapped_column(String(45), default="", nullable=False)
    user_agent: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    successful: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )


class RevokedToken(Base):
    """Отозванные обновляющие токены («чёрный список»).

    При выходе из системы мы удаляем куку, но сам токен остаётся
    действительным до конца срока. Если его успели перехватить, им можно было
    бы продлевать чужую сессию. Поэтому при выходе записываем сюда
    идентификатор токена (`jti`), а ручка обновления сверяется с этим списком.

    Строки живут не дольше самого токена: истёкшие подчищает
    еженедельная задача `cleanup_revoked_tokens`.
    """

    __tablename__ = "revoked_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # Когда истекает сам токен: после этой даты запись бесполезна.
    expires_at: Mapped[object] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    created_at: Mapped[object] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
