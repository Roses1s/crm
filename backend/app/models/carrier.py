from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, Column, ForeignKey, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.crm import Tag

if TYPE_CHECKING:
    from app.models.shipment import Shipment


carrier_tags = Table(
    "carrier_tags",
    Base.metadata,
    Column("carrier_id", ForeignKey("carriers.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Carrier(Base, TimestampMixin):
    """Перевозчик."""

    __tablename__ = "carriers"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    inn: Mapped[str] = mapped_column(String(12), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    shipments: Mapped[list[Shipment]] = relationship(back_populates="carrier")
    # Теги — свободный общий справочник (см. app.models.crm.Tag), здесь просто
    # связь многие-ко-многим, без обратной ссылки на Tag (она не нужна).
    tags: Mapped[list[Tag]] = relationship(secondary=carrier_tags, lazy="selectin")
