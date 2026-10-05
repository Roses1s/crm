from __future__ import annotations

import enum
from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, Enum, ForeignKey, ForeignKeyConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.crm import Lead
    from app.models.user import User


class EntryType(enum.StrEnum):
    note = "note"
    history = "history"
    message = "message"


#: Подписи записей истории о переносе карточки между этапами: у лида и у заявки.
#: Такие записи разрешено удалять любому сотруднику, остальная история неизменяема.
LEAD_STAGE_LABEL = "Этапы лидов"
SHIPMENT_STAGE_LABEL = "Этап"
STAGE_FIELD_LABELS = frozenset({LEAD_STAGE_LABEL, SHIPMENT_STAGE_LABEL})


class TimelineEntry(Base, TimestampMixin):
    """Запись ленты чаттера: примечание или изменение поля."""

    __tablename__ = "timeline_entries"
    __table_args__ = (
        ForeignKeyConstraint(
            ["shipment_id", "lead_id"],
            ["shipments.id", "shipments.lead_id"],
            name="fk_timeline_entries_shipment_lead_shipments",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Лента заявки: запись принадлежит и заявке (shipment_id), и её лиду
    # (lead_id остаётся заполненным для каскадного удаления). У записей лида
    # shipment_id пуст — так две ленты не смешиваются.
    shipment_id: Mapped[int | None] = mapped_column(index=True)
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

    @property
    def author_name(self) -> str:
        return self.author.full_name or self.author.email if self.author else "Система"

    @property
    def is_stage_change(self) -> bool:
        """Запись истории о переносе карточки между этапами."""
        return self.type is EntryType.history and self.field_label in STAGE_FIELD_LABELS

    @property
    def author_initials(self) -> str:
        name = self.author_name.strip()
        parts = [p for p in name.replace("@", " ").split() if p]
        return "".join(p[0] for p in parts[:2]).upper() or "—"

    attachments: Mapped[list[Attachment]] = relationship(
        back_populates="entry", cascade="all, delete-orphan", lazy="selectin"
    )


class Attachment(Base, TimestampMixin):
    """Файл, приложенный к лиду, к записи ленты или к заявке на перевозку."""

    __tablename__ = "attachments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["shipment_id", "lead_id"],
            ["shipments.id", "shipments.lead_id"],
            name="fk_attachments_shipment_lead_shipments",
            ondelete="CASCADE",
            deferrable=True,
            initially="DEFERRED",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    lead_id: Mapped[int] = mapped_column(
        ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("timeline_entries.id", ondelete="CASCADE"), index=True
    )
    # Заявка всегда принадлежит лиду, поэтому lead_id остаётся заполненным и у
    # файлов заявки: так работает и подсчёт объёма по лиду, и каскадное удаление.
    shipment_id: Mapped[int | None] = mapped_column(index=True)

    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    name: Mapped[str] = mapped_column(String(255), nullable=False)
    size: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    storage_path: Mapped[str] = mapped_column(String(512), default="", nullable=False)

    entry: Mapped[TimelineEntry | None] = relationship(back_populates="attachments")
    uploaded_by: Mapped[User | None] = relationship(lazy="joined")

    @property
    def uploaded_by_name(self) -> str:
        return self.uploaded_by.full_name or self.uploaded_by.email if self.uploaded_by else "—"
