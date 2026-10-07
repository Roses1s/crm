"""Обновление версии карточки лида при любых изменениях её полей."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from app.models.crm import Lead


def next_lead_updated_at(current: datetime) -> datetime:
    """Возвращает время новее текущего, даже если системные часы не сдвинулись."""
    current_utc = current.replace(tzinfo=UTC) if current.tzinfo is None else current.astimezone(UTC)
    return max(datetime.now(UTC), current_utc + timedelta(microseconds=1))


def advance_lead_version(lead: Lead) -> None:
    """Меняет `updated_at`, чтобы устаревший PATCH не прошёл после этой правки."""
    lead.updated_at = next_lead_updated_at(lead.updated_at)
