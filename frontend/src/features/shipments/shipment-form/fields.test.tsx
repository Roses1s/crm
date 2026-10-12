/**
 * Обёртки полей формы заявки — `SInput` и `STextarea`.
 *
 * Обе сами выбирают вид по состоянию «заполнено / пусто» и добавляют классы
 * вызывающего. Проверяем именно это: подсветку заполненного поля (по ней
 * человек с первого взгляда видит заполненные поля), сохранение переданных
 * свойств и классов, и то, что `STextarea` — многострочное поле с ручкой
 * растягивания (`resize-y`), а `SInput` — обычная строка.
 *
 * Тест появился вместе с переносом `STextarea` из `ShipmentFormPage.tsx`:
 * до переноса эти строки не выполнялись ни одной проверкой (форма рисует
 * комментарий только на вкладке «Прочая информация», куда тесты не заходят).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { SInput, STextarea } from "@/features/shipments/shipment-form/fields";
import { fieldStateCls } from "@/features/shipments/shipment-form/helpers";

describe("SInput", () => {
  it("пустое поле — без подсветки, заполненное — с подсветкой", () => {
    const empty = render(<SInput value="" readOnly />).container.querySelector("input")!;
    expect(empty.className).toBe(`${fieldStateCls(false)} `);
    expect(empty.className).toContain("bg-transparent");

    const filled = render(<SInput value="Москва" readOnly />).container.querySelector("input")!;
    expect(filled.className).toBe(`${fieldStateCls(true)} `);
    expect(filled.className).toContain("bg-odoo-primary-soft/50");
  });

  it("значение, которое ещё не пришло, считается пустым", () => {
    const input = render(<SInput />).container.querySelector("input")!;
    expect(input.className).toBe(`${fieldStateCls(false)} `);
  });

  it("дополнительные классы и свойства вызывающего сохраняются", () => {
    const { container } = render(
      <SInput type="number" placeholder="0" className="extra-cls" readOnly />,
    );
    const input = container.querySelector("input")!;
    expect(input.className).toBe(`${fieldStateCls(false)} extra-cls`);
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveAttribute("placeholder", "0");
  });
});

describe("STextarea", () => {
  it("пустое поле — без подсветки, заполненное — с подсветкой", () => {
    const empty = render(<STextarea value="" readOnly />).container.querySelector("textarea")!;
    expect(empty.className).toBe(`${fieldStateCls(false)} resize-y `);
    expect(empty.className).toContain("bg-transparent");

    const filled = render(<STextarea value="Условия" readOnly />).container.querySelector(
      "textarea",
    )!;
    expect(filled.className).toBe(`${fieldStateCls(true)} resize-y `);
    expect(filled.className).toContain("bg-odoo-primary-soft/50");
  });

  it("это многострочное поле с ручкой растягивания", () => {
    const textarea = render(<STextarea value="" readOnly />).container.querySelector("textarea")!;
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea.className).toContain("resize-y");
  });

  it("свойства из формы заявки доходят до поля", () => {
    render(
      <STextarea
        id="ship-comment"
        rows={4}
        placeholder="Дополнительные условия, комментарии…"
        value="Позвонить за час"
        readOnly
      />,
    );
    const textarea = document.getElementById("ship-comment") as HTMLTextAreaElement;
    expect(textarea).toHaveValue("Позвонить за час");
    expect(textarea).toHaveAttribute("rows", "4");
    expect(textarea).toHaveAttribute("placeholder", "Дополнительные условия, комментарии…");
  });

  it("ввод в поле отдаётся вызывающему", async () => {
    const onChange = vi.fn();
    function Wrapper() {
      const [value, setValue] = useState("");
      return (
        <STextarea
          aria-label="Комментарий"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setValue(event.target.value);
          }}
        />
      );
    }
    render(<Wrapper />);
    const textarea = screen.getByLabelText("Комментарий");

    await userEvent.type(textarea, "Привет");
    expect(textarea).toHaveValue("Привет");
    expect(onChange).toHaveBeenCalledTimes(6);
    expect(onChange.mock.calls.at(-1)?.[0]).toBe("Привет");
  });

  it("в форме с состоянием подсветка появляется сразу после ввода", async () => {
    function Wrapper() {
      const [value, setValue] = useState("");
      return (
        <STextarea
          aria-label="Комментарий"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      );
    }
    render(<Wrapper />);
    const textarea = screen.getByLabelText("Комментарий");
    expect(textarea.className).toBe(`${fieldStateCls(false)} resize-y `);

    await userEvent.type(textarea, "с");
    expect(textarea).toHaveValue("с");
    expect(textarea.className).toBe(`${fieldStateCls(true)} resize-y `);
  });
});
