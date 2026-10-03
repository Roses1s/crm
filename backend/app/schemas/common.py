from __future__ import annotations

from typing import Any, ClassVar

from pydantic import BaseModel, ConfigDict, model_validator


class ORMModel(BaseModel):
    """Схема, которую можно построить прямо из ORM-объекта."""

    model_config = ConfigDict(from_attributes=True)


class PatchModel(BaseModel):
    """Базовая схема частичного обновления (PATCH).

    Решает две тихие ошибки, из-за которых пользователь думал, что сохранил,
    а на самом деле нет:

    * **опечатка в имени поля** раньше просто игнорировалась — приходил 200 и
      неизменённая запись. Теперь неизвестное поле отвергается (`extra`);
    * **явный `null`** в поле, которое в базе обязательное, доходил до
      PostgreSQL и возвращался как 409 «Запись с такими данными уже
      существует» — сообщение про дубликат на пустое поле. Теперь это понятная
      ошибка 422 ещё до обращения к базе.

    Поля, которые действительно можно очистить (в базе они необязательные),
    перечисляются в `nullable_fields` конкретной схемы.
    """

    model_config = ConfigDict(extra="forbid")

    nullable_fields: ClassVar[frozenset[str]] = frozenset()

    @model_validator(mode="before")
    @classmethod
    def _reject_explicit_nulls(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        forbidden = sorted(
            str(name)
            for name, value in data.items()
            if value is None and name in cls.model_fields and name not in cls.nullable_fields
        )
        if forbidden:
            raise ValueError("Эти поля нельзя очистить (передан null): " + ", ".join(forbidden))
        return data


class Message(BaseModel):
    detail: str
