"""Служебные значения, одинаковые для всех сотрудников."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.deps import CurrentUser
from app.models.shipment import MARGIN_DEDUCTION_RATE

router = APIRouter(prefix="/meta", tags=["метаданные"])


@router.get("", summary="Служебные константы интерфейса")
async def get_meta(_: CurrentUser) -> dict[str, str]:
    """Единый источник значений, которые нужны и бэкенду, и фронтенду.

    Ставка вычета маржи раньше была продублирована константой в карточке
    заявки (Т-08 ревью 06.10): при смене на сервере фронтенд молча считал бы
    по-старому и цифры расходились с колонкой списка. Теперь фронтенд берёт
    значение отсюда; пока ответ не пришёл, живой пересчёт не показывается.
    """
    return {"margin_deduction_rate": str(MARGIN_DEDUCTION_RATE)}
