from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.shipment import Shipment
    from app.models.timeline import TimelineEntry
    from app.models.user import User


lead_tags = Table(
    "lead_tags",
    Base.metadata,
    Column("lead_id", ForeignKey("leads.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Stage(Base, TimestampMixin):
    """Колонка канбана. Принадлежит сотруднику: у каждого своя воронка."""

    __tablename__ = "stages"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Владелец доски. Пусто только у этапов, оставшихся от общей воронки
    # до перехода на личные доски: миграция раздаёт их администратору.
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    is_closed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="purple", nullable=False)

    leads: Mapped[list[Lead]] = relationship(back_populates="stage")


class Tag(Base, TimestampMixin):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(20), default="blue", nullable=False)

    leads: Mapped[list[Lead]] = relationship(secondary=lead_tags, back_populates="tags")


class Lead(Base, TimestampMixin):
    """Лид — карточка потенциального клиента."""

    __tablename__ = "leads"
    __table_args__ = (
        CheckConstraint("priority BETWEEN 0 AND 3", name="priority_range"),
        CheckConstraint("length(inn) IN (10, 12)", name="inn_length"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    inn: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    kpp: Mapped[str] = mapped_column(String(9), default="", nullable=False)
    timezone: Mapped[str] = mapped_column(String(16), default="", nullable=False)

    company_email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)

    logist_contact: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    logist_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    logist_email: Mapped[str | None] = mapped_column(String(255))

    credit_limit: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0"))
    first_call_date: Mapped[date | None] = mapped_column(Date)
    next_call_date: Mapped[date | None] = mapped_column(Date)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)

    stage_id: Mapped[int] = mapped_column(
        ForeignKey("stages.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assigned_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    stage: Mapped[Stage] = relationship(back_populates="leads", lazy="joined")
    assigned_to: Mapped[User | None] = relationship(back_populates="leads", lazy="joined")
    tags: Mapped[list[Tag]] = relationship(
        secondary=lead_tags, back_populates="leads", lazy="selectin"
    )
    shipments: Mapped[list[Shipment]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    timeline: Mapped[list[TimelineEntry]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    # selectin: на списке лидов это один дополнительный запрос на всю страницу,
    # а не по запросу на карточку.

    # Плоские поля для API: фронтенду удобнее получить имя этапа и
    # ответственного строкой, чем ходить за вложенными объектами.
    @property
    def stage_name(self) -> str:
        return self.stage.name if self.stage else ""

    @property
    def assigned_to_email(self) -> str | None:
        return self.assigned_to.email if self.assigned_to else None

    @property
    def assigned_to_name(self) -> str | None:
        return self.assigned_to.full_name if self.assigned_to else None

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Lead {self.id} {self.name}>"
