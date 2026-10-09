"""Единый формат ошибок API.

Любая ошибка возвращается как {"detail": "...", "code": "...", "request_id": "..."} —
фронтенду не нужно разбирать три разных формата.

Нарушения целостности базы различаются по виду (см. `_classify_integrity_error`):
дубликат, пустое обязательное поле, отсутствующая связанная запись, нарушенное
CHECK-ограничение. Раньше всё это отдавалось одним текстом «Запись с такими
данными уже существует» — и пустое поле выглядело как дубликат.
"""

from __future__ import annotations

from typing import Any

import structlog
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import DataError, IntegrityError
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import get_logger

log = get_logger(__name__)


class AppError(Exception):
    """Ошибка бизнес-логики с понятным кодом."""

    status_code = status.HTTP_400_BAD_REQUEST
    code = "app_error"

    def __init__(self, detail: str, *, code: str | None = None, status_code: int | None = None):
        super().__init__(detail)
        self.detail = detail
        if code:
            self.code = code
        if status_code:
            self.status_code = status_code


class NotFoundError(AppError):
    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"


class PermissionDeniedError(AppError):
    status_code = status.HTTP_403_FORBIDDEN
    code = "permission_denied"


def _payload(detail: str, code: str) -> dict[str, Any]:
    return {
        "detail": detail,
        "code": code,
        "request_id": structlog.contextvars.get_contextvars().get("request_id"),
    }


def _classify_integrity_error(exc: IntegrityError) -> tuple[str, str, int]:
    """Переводит нарушение целостности в понятное сообщение.

    Раньше ЛЮБАЯ такая ошибка отдавалась как «Запись с такими данными уже
    существует» — даже когда обязательное поле просто осталось пустым. Код
    ошибки берём у драйвера (`sqlstate`/`pgcode` PostgreSQL), а если его нет
    (SQLite в тестах) — разбираем текст.
    """
    orig = exc.orig
    sqlstate = str(getattr(orig, "sqlstate", "") or getattr(orig, "pgcode", "") or "")
    text = str(orig).lower()
    constraint_name = str(
        getattr(getattr(orig, "diag", None), "constraint_name", "")
        or getattr(orig, "constraint_name", "")
        or ""
    )

    if (
        constraint_name == "uq_shipments_number"
        or "uq_shipments_number" in text
        or ("unique constraint failed" in text and "shipments.number" in text)
    ):
        return (
            "shipment_number_conflict",
            "Номер заявки уже используется",
            status.HTTP_409_CONFLICT,
        )
    if sqlstate == "23505" or "unique constraint" in text or "duplicate key" in text:
        return "conflict", "Запись с такими данными уже существует", status.HTTP_409_CONFLICT
    if sqlstate == "23502" or "not null" in text:
        return (
            "not_null_violation",
            "Обязательное поле осталось пустым",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    if sqlstate == "23503" or "foreign key" in text:
        return (
            "foreign_key_violation",
            "Связанная запись не найдена или ещё используется",
            status.HTTP_409_CONFLICT,
        )
    if sqlstate == "23514" or "check constraint" in text:
        return (
            "check_violation",
            "Значение не прошло проверку базы данных",
            status.HTTP_422_UNPROCESSABLE_CONTENT,
        )
    return "conflict", "Не удалось сохранить: данные нарушают ограничения базы", 409


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_payload(exc.detail, exc.code))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=_payload(str(exc.detail), f"http_{exc.status_code}"),
            headers=getattr(exc, "headers", None),
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        # exc.errors() содержит объекты исключений в ctx — их нельзя отдать в JSON,
        # поэтому оставляем только поле, сообщение и тип ошибки.
        errors = [
            {
                "loc": [str(part) for part in err.get("loc", [])],
                "msg": err.get("msg", ""),
                "type": err.get("type", ""),
            }
            for err in exc.errors()
        ]
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content={
                **_payload("Проверьте переданные данные", "validation_error"),
                "errors": errors,
            },
        )

    @app.exception_handler(IntegrityError)
    async def _integrity_error(_: Request, exc: IntegrityError) -> JSONResponse:
        log.warning("db.integrity_error", error=str(exc.orig))
        code, detail, http_status = _classify_integrity_error(exc)
        return JSONResponse(status_code=http_status, content=_payload(detail, code))

    @app.exception_handler(DataError)
    async def _data_error(_: Request, exc: DataError) -> JSONResponse:
        # Например, число вышло за точность Numeric или строка за пределы
        # колонки. Это некорректные данные запроса, а не необработанный 500.
        log.warning("db.data_error", error=str(exc.orig))
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            content=_payload("Переданные данные выходят за допустимые ограничения", "data_error"),
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.exception("unhandled_error", error=str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=_payload("Внутренняя ошибка сервера", "internal_error"),
        )
