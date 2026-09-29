from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    """Схема, которую можно построить прямо из ORM-объекта."""

    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str
