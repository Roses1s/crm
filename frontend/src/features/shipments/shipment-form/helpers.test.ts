import { describe, expect, it } from "vitest";

import {
  fieldStateCls,
  fromDatetimeLocal,
  netAmount,
  selectStateCls,
  taxRatePercent,
  toDatetimeLocal,
} from "@/features/shipments/shipment-form/helpers";

describe("вид поля заявки по состоянию", () => {
  it("пустое и заполненное поле выглядят по-разному", () => {
    expect(fieldStateCls(true)).not.toBe(fieldStateCls(false));
  });

  it("оба состояния дают готовый набор классов без дыр", () => {
    for (const filled of [true, false]) {
      expect(fieldStateCls(filled).trim()).not.toBe("");
      // Незаполненная подстановка в шаблон оставила бы «undefined» в классе.
      expect(fieldStateCls(filled)).not.toMatch(/undefined/);
      expect(selectStateCls(filled)).not.toMatch(/undefined/);
    }
  });

  it("выпадающий список повторяет состояние поля и оставляет место под стрелку", () => {
    expect(selectStateCls(true)).toContain(fieldStateCls(true));
    expect(selectStateCls(false)).toContain(fieldStateCls(false));
    // Без этого отступа браузерная стрелка наезжала на текст («НДС 22⌄»).
    expect(selectStateCls(true)).toMatch(/pr-6$/);
  });
});

describe("ставка НДС", () => {
  it("распознаёт 22 процента", () => {
    expect(taxRatePercent("vat_22")).toBe(22);
  });

  it("«без НДС» и нулевую ставку считает нулём", () => {
    expect(taxRatePercent("no_vat")).toBe(0);
    expect(taxRatePercent("vat_0")).toBe(0);
  });

  it("неизвестное значение трактует как 0 процентов, а не как ошибку", () => {
    expect(taxRatePercent("")).toBe(0);
    expect(taxRatePercent("vat_10")).toBe(0);
    expect(taxRatePercent("VAT_22")).toBe(0);
  });
});

describe("сумма без НДС", () => {
  it("вычитает 22 процента из цены с НДС", () => {
    expect(netAmount("122", "vat_22")).toBeCloseTo(100, 6);
    expect(netAmount("244", "vat_22")).toBeCloseTo(200, 6);
  });

  it("без НДС оставляет цену как есть", () => {
    expect(netAmount("100", "no_vat")).toBe(100);
    expect(netAmount("100", "vat_0")).toBe(100);
  });

  it("ноль — это значение, а не пустое поле", () => {
    expect(netAmount("0", "vat_22")).toBe(0);
  });

  it("пустая строка и нечисловой текст дают null: цену ещё не ввели", () => {
    expect(netAmount("", "vat_22")).toBeNull();
    expect(netAmount("abc", "vat_22")).toBeNull();
  });

  it("знак сохраняется: сторнирующая цена остаётся отрицательной", () => {
    expect(netAmount("-122", "vat_22")).toBeCloseTo(-100, 6);
  });

  it("пробелы сейчас считаются нулём — поведение оставлено прежним", () => {
    // Так работало и до выноса: строка из пробелов приводит Number к 0.
    // Через форму такие значения не приходят, тест фиксирует факт.
    expect(netAmount(" ", "vat_22")).toBe(0);
  });
});

describe("дата в поле заявки", () => {
  it("показывает время без секунд — ровно то, что понимает поле", () => {
    expect(toDatetimeLocal("2026-06-15T10:20:30.500Z")).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("сервер → поле → сервер возвращает тот же момент времени", () => {
    const fromServer = "2026-06-15T10:20:30.123Z";

    expect(fromDatetimeLocal(toDatetimeLocal(fromServer))).toBe("2026-06-15T10:20:00.000Z");
  });

  it("секунды отбрасываются, а не округляются вверх", () => {
    expect(fromDatetimeLocal(toDatetimeLocal("2026-06-15T10:20:59.999Z"))).toBe(
      "2026-06-15T10:20:00.000Z",
    );
  });

  it("пустая или испорченная дата с сервера не превращается в мусор в поле", () => {
    expect(toDatetimeLocal("")).toBe("");
    expect(toDatetimeLocal("не дата")).toBe("");
  });

  it("пустое значение поля не уходит на сервер: проверка стоит на месте вызова", () => {
    // Преобразование пустой строки бросает RangeError — так было и раньше.
    // Форма подставляет created_at только когда поле заполнено, поэтому
    // пустая строка сюда не попадает. Тест фиксирует границу, чтобы
    // поведение не поменялось незаметно.
    expect(() => fromDatetimeLocal("")).toThrow(RangeError);
  });
});
