from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    ForeignKey,
    Index,
    Integer,
    String,
    Table,
    UniqueConstraint,
    true,
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
    # Владелец доски, которой принадлежит этап. Поле обязательное: этап без
    # хозяина не относится ни к чьей воронке. Временная допустимость пустоты
    # требовалась лишь на период перехода с общей доски на личные.
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sequence: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    color: Mapped[str] = mapped_column(String(20), default="purple", nullable=False)

    leads: Mapped[list[Lead]] = relationship(back_populates="stage")


class Tag(Base, TimestampMixin):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    # Цвет по умолчанию — значение HEX, а не имя цвета (миграция
    # 20261001_1600_generic_tags, TagCreate.color в schemas/crm.py). Это
    # только значение по умолчанию на стороне ORM: пока API передаёт цвет
    # явно, в базе оно ни на что не влияет.
    color: Mapped[str] = mapped_column(String(20), default="#3B82F6", nullable=False)

    leads: Mapped[list[Lead]] = relationship(secondary=lead_tags, back_populates="tags")


class LossReason(Base, TimestampMixin):
    """Причина проигрыша лида — короткий справочник, как теги.

    Список редактируемый (не зашит в код намертво): новую причину можно
    добавить через API, не трогая код и не выпуская релиз.
    """

    __tablename__ = "loss_reasons"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)


class Accountant(Base, TimestampMixin):
    """Бухгалтер в справочнике назначений; удаление скрывает его из выбора."""

    __tablename__ = "accountants"
    __table_args__ = (UniqueConstraint("name", name="uq_accountants_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )


class Lead(Base, TimestampMixin):
    """Лид — карточка потенциального клиента."""

    __tablename__ = "leads"
    # Индекс обеспечивает сортировку списков по убыванию updated_at без
    # полной сортировки таблицы (ревью 06.10, М-03).
    __table_args__ = (
        CheckConstraint("priority BETWEEN 0 AND 3", name="priority_range"),
        CheckConstraint("length(inn) IN (10, 12)", name="inn_length"),
        Index("ix_leads_updated_at", "updated_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    inn: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    logist_contact: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    logist_phone: Mapped[str] = mapped_column(String(32), default="", nullable=False)
    logist_email: Mapped[str | None] = mapped_column(String(255))
    # Бухгалтер не зависит от продавца (assigned_to_id): у него отдельный
    # фиксированный список, и подстановка одного вместо другого недопустима.
    accountant_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Смысл поля изменён 01.10.2026: теперь оно означает «лид проигран», а
    # не мягкое удаление. Имя is_archived сохранено, чтобы не переписывать
    # весь завязанный на него код.
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    # Причина заполняется только при проигранном лиде (is_archived=True).
    # Восстановление и передача (restore_lead/transfer_lead) поле очищают,
    # но запись о причине навсегда остаётся в ленте карточки.
    loss_reason_id: Mapped[int | None] = mapped_column(
        ForeignKey("loss_reasons.id", ondelete="SET NULL"), index=True
    )

    stage_id: Mapped[int] = mapped_column(
        ForeignKey("stages.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    assigned_to_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), index=True
    )

    stage: Mapped[Stage] = relationship(back_populates="leads", lazy="joined")
    assigned_to: Mapped[User | None] = relationship(back_populates="leads", lazy="joined")
    loss_reason: Mapped[LossReason | None] = relationship(lazy="joined")
    tags: Mapped[list[Tag]] = relationship(
        secondary=lead_tags, back_populates="leads", lazy="selectin"
    )
    shipments: Mapped[list[Shipment]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    timeline: Mapped[list[TimelineEntry]] = relationship(
        back_populates="lead", cascade="all, delete-orphan"
    )
    # Стратегия selectin: на странице списка это один дополнительный запрос
    # на все карточки, а не отдельный запрос под каждую карточку.

    # Имена этапа и ответственного дублируются плоскими полями для API:
    # фронтенду проще получить готовые строки, чем разбирать вложенные
    # объекты ради двух подписей.
    @property
    def stage_name(self) -> str:
        return self.stage.name if self.stage else ""

    @property
    def assigned_to_email(self) -> str | None:
        return self.assigned_to.email if self.assigned_to else None

    @property
    def assigned_to_name(self) -> str | None:
        return self.assigned_to.full_name if self.assigned_to else None

    @property
    def loss_reason_name(self) -> str | None:
        return self.loss_reason.name if self.loss_reason else None

    def __repr__(self) -> str:  # pragma: no cover
        return f"<Lead {self.id} {self.name}>"
