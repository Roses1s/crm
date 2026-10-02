"""Общие валидаторы полей, переиспользуемые в нескольких схемах.

Раньше контрольная сумма ИНН проверялась только у лида (`LeadBase`), а
`LeadUpdate` подключал тот же валидатор хаком через `.__func__`
(`field_validator("inn")(LeadBase.validate_inn.__func__)`), и у перевозчика
(`Carrier`) чек-суммы не было вообще. Здесь — одна функция на всех.
"""

from __future__ import annotations


def inn_checksum_ok(inn: str) -> bool:
    """Контрольная сумма ИНН по алгоритму ФНС."""

    def weighted(weights: list[int]) -> int:
        return sum(w * int(d) for w, d in zip(weights, inn, strict=False)) % 11 % 10

    if len(inn) == 10:
        return weighted([2, 4, 10, 3, 5, 9, 4, 6, 8]) == int(inn[9])
    first = weighted([7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
    second = weighted([3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8])
    return first == int(inn[10]) and second == int(inn[11])


def validate_inn(value: str) -> str:
    """ИНН: 10 или 12 цифр плюс контрольная сумма ФНС.

    Используется как тело `field_validator("inn")` в схемах лида и
    перевозчика — задаём его один раз здесь, а не копируем в каждой схеме.
    """
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) not in (10, 12):
        raise ValueError("ИНН должен содержать 10 или 12 цифр")
    if not inn_checksum_ok(digits):
        raise ValueError("Некорректный ИНН: не сходится контрольная сумма")
    return digits


def validate_inn_optional(value: str) -> str:
    """Как `validate_inn`, но пустая строка разрешена.

    Перевозчик в заявке теперь просто текстовое поле (см.
    `app.schemas.shipment.carrier_inn`), а не запись в справочнике — его ИНН
    не всегда известен в момент заведения заявки. Если что-то введено,
    контрольную сумму по-прежнему проверяем, но ни на какие другие записи
    (лиды, другие заявки) это поле не сверяем — пересечений/дублей здесь
    сознательно нет.
    """
    digits = "".join(ch for ch in value if ch.isdigit())
    if not digits:
        return ""
    return validate_inn(digits)
