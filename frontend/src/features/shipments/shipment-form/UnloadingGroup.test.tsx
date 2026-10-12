/**
 * Блок «Информация о выгрузке» формы заявки.
 *
 * Компонент без собственного состояния: значения приходят через props, правки
 * уходят наверх обработчиками — по одному на поле. Проверяем проводку
 * (каждое поле отдаёт своё значение в свой обработчик и ни в какой другой),
 * подписи, id, порядок и подсказки полей, работу меток (чипы) и подсветку
 * заполненных полей.
 *
 * Тесты появились вместе с переносом блока из `ShipmentFormPage.tsx`: до
 * переноса ни одно из шести полей ни разу не редактировалось в тестах —
 * обработчики в странице были непокрытыми. Перепутанные местами обработчики
 * такой тест обязан ронять.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { UnloadingGroup } from "@/features/shipments/shipment-form/UnloadingGroup";

type Values = {
  unloadingCities: string[];
  addressUnloading: string;
  contactUnloadingName: string;
  unloadingDateFrom: string;
  unloadingDateTo: string;
  unloadingTimeFrom: string;
};

const EMPTY: Values = {
  unloadingCities: [],
  addressUnloading: "",
  contactUnloadingName: "",
  unloadingDateFrom: "",
  unloadingDateTo: "",
  unloadingTimeFrom: "",
};

function renderGroup(values: Partial<Values> = {}) {
  const handlers = {
    onUnloadingCitiesChange: vi.fn(),
    onAddressUnloadingChange: vi.fn(),
    onContactUnloadingNameChange: vi.fn(),
    onUnloadingDateFromChange: vi.fn(),
    onUnloadingDateToChange: vi.fn(),
    onUnloadingTimeFromChange: vi.fn(),
  };
  const view = render(<UnloadingGroup {...EMPTY} {...values} {...handlers} />);
  return { ...view, handlers };
}

const FIELDS: {
  id: string;
  label: string;
  handler: keyof ReturnType<typeof renderGroup>["handlers"];
  kind: "token" | "text" | "date";
  typed: string;
  expected: unknown;
}[] = [
  {
    id: "ship-unload-cities",
    label: "Города выгрузки",
    handler: "onUnloadingCitiesChange",
    kind: "token",
    typed: "Казань",
    expected: ["Казань"],
  },
  {
    id: "ship-addr-unload",
    label: "Адрес выгрузки",
    handler: "onAddressUnloadingChange",
    kind: "text",
    typed: "Склад №2",
    expected: "Склад №2",
  },
  {
    id: "ship-unload-name",
    label: "Контактное лицо на выгрузке и телефон",
    handler: "onContactUnloadingNameChange",
    kind: "text",
    typed: "Петров Пётр, +7 900 111-22-33",
    expected: "Петров Пётр, +7 900 111-22-33",
  },
  {
    id: "ship-unload-date-from",
    label: "Дата выгрузки с",
    handler: "onUnloadingDateFromChange",
    kind: "date",
    typed: "2026-02-10",
    expected: "2026-02-10",
  },
  {
    id: "ship-unload-date-to",
    label: "Дата выгрузки по",
    handler: "onUnloadingDateToChange",
    kind: "date",
    typed: "2026-02-11",
    expected: "2026-02-11",
  },
  {
    id: "ship-unload-time-from",
    label: "Время",
    handler: "onUnloadingTimeFromChange",
    kind: "text",
    typed: "14:00",
    expected: "14:00",
  },
];

describe("UnloadingGroup", () => {
  it("каждое поле отдаёт значение только своему обработчику", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup();

    for (const field of FIELDS) {
      for (const handler of Object.values(handlers)) handler.mockClear();

      const host = document.getElementById(field.id) as HTMLInputElement;
      if (field.kind === "token") {
        // Ввод метки: у TokenField собственный черновик, Enter его фиксирует.
        await user.type(host, `${field.typed}{Enter}`);
      } else if (field.kind === "date") {
        // Дата в jsdom принимается только целиком в формате yyyy-mm-dd.
        fireEvent.change(host, { target: { value: field.typed } });
      } else {
        // Обычное поле: вставляем значение целиком, чтобы обработчик получил
        // строку как в жизни (по буквам поле контролируемое отдаёт по одной).
        await user.click(host);
        await user.paste(field.typed);
      }

      expect(handlers[field.handler], `поле ${field.id}`).toHaveBeenCalledWith(field.expected);
      for (const [name, handler] of Object.entries(handlers)) {
        if (name !== field.handler) {
          expect(handler, `поле ${field.id} задело ${name}`).not.toHaveBeenCalled();
        }
      }
    }
  });

  it("подписи, id и порядок полей сохранены", () => {
    const { container } = renderGroup();

    const labels = FIELDS.map((field) => {
      const label = document.querySelector(`label[for="${field.id}"]`);
      return label?.textContent?.trim();
    });
    expect(labels).toEqual(FIELDS.map((field) => field.label));

    // id полей идут ровно в прежнем порядке (у «Адреса» он не начинается
    // с префикса блока, поэтому берём все поля блока как есть).
    const rendered = [...container.querySelectorAll("input")].map((element) => element.id);
    expect(rendered).toEqual(FIELDS.map((field) => field.id));
  });

  it("подсказки и типы полей сохранены", () => {
    renderGroup();

    const placeholder = (id: string) =>
      (document.getElementById(id) as HTMLInputElement).getAttribute("placeholder");
    expect(placeholder("ship-unload-cities")).toBe("Город + Enter");
    expect(placeholder("ship-unload-name")).toBe("Иванов Иван, +7 900 000-00-00");
    expect(placeholder("ship-unload-time-from")).toBe("09:00");

    expect(document.getElementById("ship-unload-date-from")).toHaveAttribute("type", "date");
    expect(document.getElementById("ship-unload-date-to")).toHaveAttribute("type", "date");
    expect(document.getElementById("ship-addr-unload")).not.toHaveAttribute("type", "date");
  });

  it("метки показываются чипами и убираются", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ unloadingCities: ["Казань", "Тверь"] });

    expect(screen.getByText("Казань")).toBeVisible();
    expect(screen.getByText("Тверь")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Убрать Казань" }));
    expect(handlers.onUnloadingCitiesChange).toHaveBeenCalledWith(["Тверь"]);
    expect(handlers.onAddressUnloadingChange).not.toHaveBeenCalled();
  });

  it("новая метка добавляется к уже выбранным", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ unloadingCities: ["Казань"] });

    await user.type(
      document.getElementById("ship-unload-cities") as HTMLInputElement,
      "Тверь{Enter}",
    );

    expect(handlers.onUnloadingCitiesChange).toHaveBeenCalledWith(["Казань", "Тверь"]);
  });

  it("собственного состояния нет: смена props сразу меняет поля", () => {
    const { rerender, handlers } = renderGroup({ addressUnloading: "Склад №2" });
    expect(document.getElementById("ship-addr-unload")).toHaveValue("Склад №2");

    rerender(<UnloadingGroup {...EMPTY} {...handlers} addressUnloading="Склад №7" />);

    expect(document.getElementById("ship-addr-unload")).toHaveValue("Склад №7");
  });

  it("пустое поле без подсветки, заполненное — с подсветкой", () => {
    const { rerender, handlers } = renderGroup({ addressUnloading: "" });
    const emptyField = document.getElementById("ship-addr-unload") as HTMLInputElement;
    expect(emptyField.className).toContain("bg-transparent");

    rerender(<UnloadingGroup {...EMPTY} {...handlers} addressUnloading="Склад №2" />);

    expect(emptyField.className).toContain("bg-odoo-primary-soft/50");
  });
});
