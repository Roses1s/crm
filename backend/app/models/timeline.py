from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.crm import Lead
    from app.models.user import User


class EntryType(enum.StrEnum):
    note = "note"
    history = "history"
    message = "message"
    activity = "activity"


class TimelineEntry(Base, TimestampMixin):
    """Запись ленты чаттера: примечание или изменение поля."""

    __tablename__ = "timeline_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    author_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    type: Mapped[EntryType] = mapped_column(
        Enum(
            EntryType,
            native_enum=False,
            length=20,
            values_callable=lambda e: [x.value for x in e],
        ),
        default=EntryType.note,
        nullable=False,
    )
    body: Mapped[str] = mapped_column(Text, default="", nullable=False)
    field_label: Mapped[str | None] = mapped_column(String(120))
    old_value: Mapped[str | None] = mapped_column(String(255))
    new_value: Mapped[str | None] = mapped_column(String(255))

    lead: Mapped[Lead] = relationship(back_populates="timeline")
    author: Mapped[User | None] = relationship(lazy="joined")
    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="entry", cascade="all, delete-orphan", lazy="selectin"
    )


class Attachment(Base, TimestampMixin):
    """Файл, приложенный к лиду или к записи ленты."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("timeline_entries.id", ondelete="CASCADE"), index=True
    )
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), default="", nullable=False)

    entry: Mapped[TimelineEntry | None] = relationship(back_populates="attachments")
    uploaded_by: Mapped[User | None] = relationship(lazy="joined")
