/**
 * Вкладка «Позиции заказа» формы заявки.
 *
 * Компонент без состояния: значения приходят через props, обработчики уходят
 * наверх. Поэтому здесь проверяются сами расчёты (налог и маржа), показ
 * пустых и нулевых значений и то, что после правки поля пересчёт происходит
 * сразу — порядок обновления такой же, как был внутри страницы заявки.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { OrderLinesTab } from "@/features/shipments/shipment-form/OrderLinesTab";

type Props = {
  customerPrice?: string;
  customerTax?: string;
  carrierPrice?: string;
  carrierTax?: string;
  deductionRate?: number | null;
};

function renderTab(props: Props = {}) {
  const handlers = {
    onCustomerPriceChange: vi.fn(),
    onCustomerTaxChange: vi.fn(),
    onCarrierPriceChange: vi.fn(),
    onCarrierTaxChange: vi.fn(),
  };
  const view = render(
    <OrderLinesTab
      customerPrice={props.customerPrice ?? ""}
      customerTax={props.customerTax ?? "vat_22"}
      carrierPrice={props.carrierPrice ?? ""}
      carrierTax={props.carrierTax ?? "vat_22"}
      deductionRate={props.deductionRate === undefined ? 0.25 : props.deductionRate}
      {...handlers}
    />,
  );

  // Колонки строки: 0 — продукт, 1 — цена заказчика, 2 — налог заказчика,
  // 3 — сумма без НДС у заказчика, 4 — цена перевозчика, 5 — налог
  // перевозчика, 6 — сумма без НДС у перевозчика.
  const cells = () =>
    Array.from(view.container.querySelectorAll("tbody td")).map((td) => td.textContent ?? "");

  return {
    ...handlers,
    ...view,
    /** ru-RU разделяет разряды неразрывным пробелом — приводим к обычному. */
    customerNet: () => cells()[3].replace(/\u00A0/g, " "),
    carrierNet: () => cells()[6].replace(/\u00A0/g, " "),
    margin: () =>
      (screen.getByText("Маржа").nextElementSibling?.textContent ?? "").replace(/\u00A0/g, " "),
  };
}

describe("расчёт налога и маржи", () => {
  it("вычитает НДС 22% из цены заказчика и показывает сумму без налога", () => {
    const tab = renderTab({ customerPrice: "122000", customerTax: "vat_22" });

    expect(tab.customerNet()).toBe("100 000,00");
  });

  it("«без НДС» оставляет цену как есть и у заказчика, и у перевозчика", () => {
    const tab = renderTab({
      customerPrice: "100000",
      customerTax: "no_vat",
      carrierPrice: "80000",
      carrierTax: "no_vat",
    });

    expect(tab.customerNet()).toBe("100 000,00");
    expect(tab.carrierNet()).toBe("80 000,00");
  });

  it("нулевая ставка (НДС 0%) тоже не меняет цену", () => {
    const tab = renderTab({ customerPrice: "55000", customerTax: "vat_0" });

    expect(tab.customerNet()).toBe("55 000,00");
  });

  it("маржа — разница сумм без НДС минус доля доп. расходов: (100 000 − 80 000) × 0,75", () => {
    const tab = renderTab({
      customerPrice: "122000",
      customerTax: "vat_22",
      carrierPrice: "80000",
      carrierTax: "no_vat",
      deductionRate: 0.25,
    });

    expect(tab.margin()).toBe("15 000,00");
  });

  it("ставка вычета приходит снаружи: при нуле маржа равна всей разнице", () => {
    const tab = renderTab({
      customerPrice: "122000",
      customerTax: "vat_22",
      carrierPrice: "80000",
      carrierTax: "no_vat",
      deductionRate: 0,
    });

    expect(tab.margin()).toBe("20 000,00");
  });

  it("копейки округляются до двух знаков после запятой", () => {
    // 122,55 / 1,22 = 100,450819…; 77,77 / 1,22 = 63,745901…; разница × 0,75 = 27,5286…
    const tab = renderTab({
      customerPrice: "122.55",
      customerTax: "vat_22",
      carrierPrice: "77.77",
      carrierTax: "vat_22",
    });

    expect(tab.customerNet()).toBe("100,45");
    expect(tab.carrierNet()).toBe("63,75");
    expect(tab.margin()).toBe("27,53");
  });

  it("когда перевозчик дороже, маржа показывается со знаком минус", () => {
    const tab = renderTab({
      customerPrice: "100",
      customerTax: "no_vat",
      carrierPrice: "200",
      carrierTax: "no_vat",
    });

    expect(tab.margin()).toBe("-75,00");
  });

  it("крупные суммы показываются с разрядами", () => {
    const tab = renderTab({ customerPrice: "1000000", customerTax: "no_vat" });

    expect(tab.customerNet()).toBe("1 000 000,00");
  });
});

describe("пустые, нулевые и неизвестные значения", () => {
  it("пустые цены: колонки сумм пусты, маржа — прочерк", () => {
    const tab = renderTab({ customerPrice: "", carrierPrice: "" });

    expect(tab.customerNet()).toBe("");
    expect(tab.carrierNet()).toBe("");
    expect(tab.margin()).toBe("—");
  });

  it("заполнена только одна цена: у неё сумма считается, маржа — прочерк", () => {
    const tab = renderTab({ customerPrice: "122000", carrierPrice: "" });

    expect(tab.customerNet()).toBe("100 000,00");
    expect(tab.carrierNet()).toBe("");
    expect(tab.margin()).toBe("—");
  });

  it("ноль — это значение, а не пустое поле: показываем 0,00", () => {
    const tab = renderTab({ customerPrice: "0", customerTax: "vat_22", carrierPrice: "0" });

    expect(tab.customerNet()).toBe("0,00");
    expect(tab.carrierNet()).toBe("0,00");
    // Обе цены заданы и равны — разница честно нулевая, а не «неизвестно».
    expect(tab.margin()).toBe("0,00");
  });

  it("равные суммы без НДС дают нулевую маржу, а не прочерк", () => {
    const tab = renderTab({
      customerPrice: "122",
      customerTax: "vat_22",
      carrierPrice: "100",
      carrierTax: "no_vat",
    });

    expect(tab.margin()).toBe("0,00");
  });

  it("пока ставка вычета не пришла с сервера (null), маржа — прочерк, суммы считаются", () => {
    const tab = renderTab({
      customerPrice: "122000",
      customerTax: "vat_22",
      carrierPrice: "80000",
      carrierTax: "no_vat",
      deductionRate: null,
    });

    expect(tab.customerNet()).toBe("100 000,00");
    expect(tab.carrierNet()).toBe("80 000,00");
    expect(tab.margin()).toBe("—");
  });

  it("нечисловой текст в цене считается незаполненным полем", () => {
    const tab = renderTab({ customerPrice: "abc", carrierPrice: "10" });

    expect(tab.customerNet()).toBe("");
    expect(tab.margin()).toBe("—");
  });
});

describe("данные приходят только через props", () => {
  it("правка цены отдаёт значение наверх своим обработчиком и не трогает чужие", async () => {
    const user = userEvent.setup();
    const tab = renderTab({ customerPrice: "" });

    await user.type(screen.getByLabelText("Цена для заказчика"), "1");

    expect(tab.onCustomerPriceChange).toHaveBeenCalledWith("1");
    expect(tab.onCustomerTaxChange).not.toHaveBeenCalled();
    expect(tab.onCarrierPriceChange).not.toHaveBeenCalled();
    expect(tab.onCarrierTaxChange).not.toHaveBeenCalled();
  });

  it("смена налога у перевозчика уходит своим обработчиком", async () => {
    const user = userEvent.setup();
    const tab = renderTab({});

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "no_vat");

    expect(tab.onCarrierTaxChange).toHaveBeenCalledWith("no_vat");
    expect(tab.onCustomerTaxChange).not.toHaveBeenCalled();
  });

  it("собственного состояния нет: новые props сразу меняют показанные суммы", () => {
    const tab = renderTab({ customerPrice: "122", customerTax: "vat_22" });
    expect(tab.customerNet()).toBe("100,00");

    tab.rerender(
      <OrderLinesTab
        customerPrice="244"
        customerTax="vat_22"
        carrierPrice=""
        carrierTax="vat_22"
        deductionRate={0.25}
        onCustomerPriceChange={tab.onCustomerPriceChange}
        onCustomerTaxChange={tab.onCustomerTaxChange}
        onCarrierPriceChange={tab.onCarrierPriceChange}
        onCarrierTaxChange={tab.onCarrierTaxChange}
      />,
    );

    expect(tab.customerNet()).toBe("200,00");
  });
});

describe("пересчёт при редактировании полей", () => {
  /** Обёртка как настоящая форма: значения в состоянии, компонент — на props. */
  function Form() {
    const [customerPrice, setCustomerPrice] = useState("");
    const [customerTax, setCustomerTax] = useState("vat_22");
    const [carrierPrice, setCarrierPrice] = useState("");
    const [carrierTax, setCarrierTax] = useState("vat_22");
    return (
      <OrderLinesTab
        customerPrice={customerPrice}
        customerTax={customerTax}
        carrierPrice={carrierPrice}
        carrierTax={carrierTax}
        deductionRate={0.25}
        onCustomerPriceChange={setCustomerPrice}
        onCustomerTaxChange={setCustomerTax}
        onCarrierPriceChange={setCarrierPrice}
        onCarrierTaxChange={setCarrierTax}
      />
    );
  }

  it("сумма без НДС и маржа обновляются сразу после ввода цены", async () => {
    const user = userEvent.setup();
    render(<Form />);

    const cells = () =>
      Array.from(document.querySelectorAll("tbody td")).map((td) =>
        (td.textContent ?? "").replace(/\u00A0/g, " "),
      );
    const margin = () =>
      (screen.getByText("Маржа").nextElementSibling?.textContent ?? "").replace(/\u00A0/g, " ");

    await user.type(screen.getByLabelText("Цена для заказчика"), "122000");
    expect(cells()[3]).toBe("100 000,00");
    // Пока второй цены нет, маржа остаётся неизвестной.
    expect(margin()).toBe("—");

    // У перевозчика по умолчанию та же ставка 22%: 80 000 / 1,22 = 65 573,77.
    await user.type(screen.getByLabelText("Цена для перевозчика"), "80000");
    expect(cells()[6]).toBe("65 573,77");
    expect(margin()).toBe("25 819,67");
  });

  it("смена налога пересчитывает сумму без НДС и маржу", async () => {
    const user = userEvent.setup();
    render(<Form />);

    await user.type(screen.getByLabelText("Цена для заказчика"), "122000");
    await user.type(screen.getByLabelText("Цена для перевозчика"), "80000");

    const taxSelect = document.querySelectorAll("select")[0] as HTMLSelectElement;
    await user.selectOptions(taxSelect, "no_vat");

    const cells = Array.from(document.querySelectorAll("tbody td")).map((td) =>
      (td.textContent ?? "").replace(/\u00A0/g, " "),
    );
    expect(cells[3]).toBe("122 000,00");
    // У заказчика цена теперь без НДС: (122 000 − 65 573,77) × 0,75.
    expect(
      (screen.getByText("Маржа").nextElementSibling?.textContent ?? "").replace(/\u00A0/g, " "),
    ).toBe("42 319,67");
  });
});
