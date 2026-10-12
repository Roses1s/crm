/**
 * Блок «Заявка» — шапка формы заявки.
 *
 * Компонент без собственного состояния и без запросов: значения приходят
 * через props, правки уходят наверх обработчиками — по одному на поле.
 * Здесь проверяется проводка (каждое поле отдаёт своё значение в свой
 * обработчик и ни в какой другой), подписи, id, порядок полей, обе ветки
 * (новая заявка и уже созданная), вариант «выбранный лид вне списка»
 * и отсутствие внутреннего состояния.
 *
 * Что осталось в странице и проверяется там: состояние поиска, реальные
 * запросы за списком лидов, выбор лида, подстановка лида по ссылке `?lead=`,
 * попадание lead_id в запрос сохранения и запрет сохранения без лида.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ShipmentHeaderGroup } from "@/features/shipments/shipment-form/ShipmentHeaderGroup";

type LeadOption = { id: number; name: string; inn: string };

const LEAD1: LeadOption = { id: 1, name: "ООО Ромашка", inn: "7701234567" };
const LEAD2: LeadOption = { id: 2, name: "ИП Петров", inn: "500100732259" };

type Values = {
  isNew: boolean;
  createdAt: string;
  leadSearch: string;
  leadId: number;
  leads: LeadOption[];
  selectedLeadDetails?: LeadOption;
  customerName: string;
  customerInn: string;
  customerContact: string;
};

const DEFAULTS: Values = {
  isNew: true,
  createdAt: "2026-02-03T10:20",
  leadSearch: "",
  leadId: 0,
  leads: [LEAD1, LEAD2],
  customerName: "Новая заявка",
  customerInn: "",
  customerContact: "",
};

function renderGroup(values: Partial<Values> = {}) {
  const handlers = {
    onCreatedAtChange: vi.fn(),
    onLeadSearchChange: vi.fn(),
    onLeadIdChange: vi.fn(),
    onCustomerContactChange: vi.fn(),
  };
  const view = render(<ShipmentHeaderGroup {...DEFAULTS} {...values} {...handlers} />);
  return { ...view, handlers };
}

type Handlers = ReturnType<typeof renderGroup>["handlers"];

const FIELDS: {
  id?: string;
  aria?: string;
  label: string;
  handler: keyof Handlers;
  kind: "text" | "datetime" | "select";
  typed: string;
  expected: unknown;
}[] = [
  {
    id: "ship-created-at",
    label: "Дата создания",
    handler: "onCreatedAtChange",
    kind: "datetime",
    typed: "2026-03-04T11:22",
    expected: "2026-03-04T11:22",
  },
  {
    aria: "Поиск лида",
    label: "Поиск лида",
    handler: "onLeadSearchChange",
    kind: "text",
    typed: "ром",
    expected: "ром",
  },
  {
    id: "ship-lead-select",
    label: "Лид",
    handler: "onLeadIdChange",
    kind: "select",
    // Селект отдаёт строку, компонент переводит её в число.
    typed: "2",
    expected: 2,
  },
  {
    id: "ship-cust-contact",
    label: "Контакт заказчика",
    handler: "onCustomerContactChange",
    kind: "text",
    typed: "Пётр, +7 900 111-22-33",
    expected: "Пётр, +7 900 111-22-33",
  },
];

function fieldHost(field: (typeof FIELDS)[number]): HTMLInputElement | HTMLSelectElement {
  const element = field.id
    ? document.getElementById(field.id)
    : screen.getByLabelText(field.aria as string);
  return element as HTMLInputElement | HTMLSelectElement;
}

describe("ShipmentHeaderGroup", () => {
  it("каждое поле отдаёт значение только своему обработчику", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup();

    for (const field of FIELDS) {
      for (const handler of Object.values(handlers)) handler.mockClear();

      const host = fieldHost(field);
      if (field.kind === "select") {
        await user.selectOptions(host as HTMLSelectElement, field.typed);
      } else if (field.kind === "datetime") {
        // Поля даты вводятся по буквам криво: пишем значение целиком.
        fireEvent.change(host, { target: { value: field.typed } });
      } else {
        await user.click(host);
        await user.paste(field.typed);
      }

      expect(handlers[field.handler], `поле ${field.label}`).toHaveBeenCalledWith(field.expected);
      for (const [name, handler] of Object.entries(handlers)) {
        if (name !== field.handler) {
          expect(handler, `поле ${field.label} задело ${name}`).not.toHaveBeenCalled();
        }
      }
    }
  });

  it("подписи, id и порядок полей сохранены", () => {
    const { container } = renderGroup();

    // «Компания» и «ИНН заказчика» — только показ, поля ввода у них нет.
    const labels = [...container.querySelectorAll("label")].map((element) => ({
      text: element.textContent?.trim(),
      htmlFor: element.getAttribute("for"),
    }));
    expect(labels).toEqual([
      { text: "Компания", htmlFor: null },
      { text: "Дата создания", htmlFor: "ship-created-at" },
      { text: "Лид", htmlFor: "ship-lead-select" },
      { text: "ИНН заказчика", htmlFor: null },
      { text: "Контакт заказчика", htmlFor: "ship-cust-contact" },
    ]);

    // Наша компания — статичная строка бланка.
    expect(screen.getByText('ООО "Детроид"')).toBeVisible();

    const rendered = [...container.querySelectorAll("input, select")].map(
      (element) => element.id || element.getAttribute("aria-label"),
    );
    expect(rendered).toEqual([
      "ship-created-at",
      "Поиск лида",
      "ship-lead-select",
      "ship-cust-contact",
    ]);
  });

  it("новая заявка: поиск лида и список с названием и ИНН", () => {
    renderGroup({ isNew: true, leadSearch: "", leadId: 0 });

    const search = screen.getByLabelText("Поиск лида") as HTMLInputElement;
    expect(search.getAttribute("placeholder")).toBe("Поиск по названию или ИНН");
    expect(search.value).toBe("");

    const select = document.getElementById("ship-lead-select") as HTMLSelectElement;
    expect(select.value).toBe("");
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Выберите лид",
      "ООО Ромашка · 7701234567",
      "ИП Петров · 500100732259",
    ]);
  });

  it("выбор лида и сброс на «Выберите лид» уходят числами", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ leadId: 0 });

    const select = document.getElementById("ship-lead-select") as HTMLSelectElement;
    await user.selectOptions(select, "2");
    expect(handlers.onLeadIdChange).toHaveBeenCalledWith(2);

    await user.selectOptions(select, "");
    expect(handlers.onLeadIdChange).toHaveBeenCalledWith(0);
  });

  it("выбранный лид вне отфильтрованного списка остаётся отдельным пунктом", () => {
    const outside: LeadOption = { id: 7, name: "ООО Вне фильтра", inn: "7712345678" };
    const { rerender, handlers } = renderGroup({
      leadId: 7,
      leads: [LEAD1],
      selectedLeadDetails: outside,
      leadSearch: "вне",
    });

    const select = document.getElementById("ship-lead-select") as HTMLSelectElement;
    expect(select.value).toBe("7");
    // Дополнительный пункт идёт перед списком — как было в странице.
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Выберите лид",
      "ООО Вне фильтра · 7712345678",
      "ООО Ромашка · 7701234567",
    ]);

    // Если лид нашёлся в списке, второй раз его показывать не нужно.
    rerender(
      <ShipmentHeaderGroup
        {...DEFAULTS}
        {...handlers}
        leadId={1}
        leads={[LEAD1]}
        selectedLeadDetails={LEAD1}
      />,
    );
    const options = [...(document.getElementById("ship-lead-select") as HTMLSelectElement).options];
    expect(options.filter((option) => option.value === "1")).toHaveLength(1);
  });

  it("существующая заявка: вместо поиска и выбора — заказчик, ИНН и контакт", async () => {
    const user = userEvent.setup();
    const { container, handlers } = renderGroup({
      isNew: false,
      leadId: 1,
      leads: [LEAD1],
      selectedLeadDetails: LEAD1,
      customerName: "ООО Ромашка",
      customerInn: "7701234567",
      customerContact: "Иван",
    });

    expect(screen.queryByLabelText("Поиск лида")).toBeNull();
    expect(container.querySelector("select")).toBeNull();
    expect(screen.getByText("ООО Ромашка")).toBeVisible();
    expect(screen.getByText("7701234567")).toBeVisible();
    expect((document.getElementById("ship-cust-contact") as HTMLInputElement).value).toBe("Иван");

    await user.click(document.getElementById("ship-cust-contact") as HTMLInputElement);
    await user.paste("Мария");
    expect(handlers.onCustomerContactChange).toHaveBeenCalledWith("ИванМария");
  });

  it("ввода ИНН нет, пустое значение показывается пустым", () => {
    renderGroup({ isNew: false, leadId: 0, customerName: "Новая заявка", customerInn: "" });

    expect(screen.getByText("Новая заявка")).toBeVisible();
    const innLabel = screen.getByText("ИНН заказчика");
    expect(innLabel.nextElementSibling?.textContent).toBe("");
  });

  it("своего состояния нет: поиск не запоминает ввод, props сразу меняют поля", async () => {
    const user = userEvent.setup();
    const { rerender, handlers } = renderGroup({ leadSearch: "", customerContact: "" });

    const search = screen.getByLabelText("Поиск лида") as HTMLInputElement;
    await user.click(search);
    await user.paste("ромашка");
    // Обработчик ушёл наверх, но сам компонент значение не хранит.
    expect(handlers.onLeadSearchChange).toHaveBeenCalledWith("ромашка");
    expect(search.value).toBe("");

    rerender(
      <ShipmentHeaderGroup
        {...DEFAULTS}
        {...handlers}
        leadSearch="ромашка"
        customerContact="Мария"
        createdAt="2026-03-04T11:22"
      />,
    );

    expect((screen.getByLabelText("Поиск лида") as HTMLInputElement).value).toBe("ромашка");
    expect((document.getElementById("ship-cust-contact") as HTMLInputElement).value).toBe("Мария");
    expect((document.getElementById("ship-created-at") as HTMLInputElement).value).toBe(
      "2026-03-04T11:22",
    );
  });
});
