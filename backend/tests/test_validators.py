"""Общий валидатор ИНН (schemas/validators.py) — используется и лидом, и
перевозчиком, поэтому проверяем его отдельно от конкретных схем."""

from __future__ import annotations

import pytest

from app.schemas.validators import inn_checksum_ok, validate_inn


@pytest.mark.parametrize(
    "inn",
    ["7707083893", "7730207515", "5024002119", "7451234565", "7447112236"],
)
def test_valid_inn_passes_checksum(inn: str) -> None:
    assert inn_checksum_ok(inn)
    assert validate_inn(inn) == inn


def test_invalid_checksum_is_rejected() -> None:
    assert not inn_checksum_ok("7700000001")
    with pytest.raises(ValueError, match="контрольная сумма"):
        validate_inn("7700000001")


def test_wrong_length_is_rejected() -> None:
    with pytest.raises(ValueError, match="10 или 12 цифр"):
        validate_inn("123")


def test_non_digit_characters_are_stripped_before_validation() -> None:
    # Тот же ИНН, но с пробелами и дефисами — валидатор чистит ввод сам.
    assert validate_inn("77-07 08 38 93") == "7707083893"
