from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Enum, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.crm import Lead


class Role(enum.StrEnum):
    """Ролей две: менеджер работает со своей воронкой, админ настраивает систему."""

    admin = "admin"
    manager = "manager"


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    first_name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    last_name: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    # native_enum=False -> VARCHAR + CHECK: одинаково работает в PostgreSQL и SQLite,
    # и добавление новой роли не требует ALTER TYPE.
    role: Mapped[Role] = mapped_column(
        Enum(Role, native_enum=False, length=20, values_callable=lambda e: [x.value for x in e]),
        default=Role.manager,
        nullable=False,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    # lazy="raise": обратная сторона Lead.assigned_to нужна только ORM для
    # back_populates, в коде к ней никто не обращается (UserRead её не отдаёт).
    # С lazy="selectin" SQLAlchemy тянула бы ВСЕ лиды пользователя (с джойнами
    # на stage/assigned_to/loss_reason и отдельным запросом тегов) при каждой
    # загрузке User — а User грузится в get_current_user на каждый запрос с
    # токеном. "raise" вместо обычного "select" — чтобы случайное обращение
    # к user.leads в будущем упало сразу понятной ошибкой, а не тихо вернуло
    # лишний SELECT на каждый HTTP-вызов.
    leads: Mapped[list[Lead]] = relationship(back_populates="assigned_to", lazy="raise")

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip()

    def __repr__(self) -> str:  # pragma: no cover
        return f"<User {self.email} ({self.role.value})>"
