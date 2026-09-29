from __future__ import annotations

import enum
from datetime import UTC, date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.crm import Lead
    from app.models.user import User


class ActivityType(enum.StrEnum):
    call = "call"
    meeting = "meeting"
    todo = "todo"
    email = "email"


class ActivityState(enum.StrEnum):
    """Состояние по сроку — им подсвечиваются часики на карточке канбана."""

    overdue = "overdue"
    today = "today"
    planned = "planned"
    done = "done"


class Activity(Base, TimestampMixin):
    """Запланированное действие по лиду: позвонить, встретиться, сделать."""

    __tablename__ = "activities"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    assigned_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    type: Mapped[ActivityType] = mapped_column(
        Enum(
            ActivityType,
            native_enum=False,
            length=20,
            values_callable=lambda e: [x.value for x in e],
        ),
        default=ActivityType.call,
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(String(255), nullable=False)
    note: Mapped[str] = mapped_column(Text, default="", nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    is_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    lead: Mapped[Lead] = relationship(back_populates="activities")
    assigned_to: Mapped[User | None] = relationship(lazy="joined")

    @property
    def state(self) -> ActivityState:
        if self.is_done:
            return ActivityState.done
        today = datetime.now(tz=UTC).date()
        if self.due_date < today:
            return ActivityState.overdue
        if self.due_date == today:
            return ActivityState.today
        return ActivityState.planned

    @property
    def assigned_to_name(self) -> str | None:
        if not self.assigned_to:
            return None
        return self.assigned_to.full_name or self.assigned_to.email
