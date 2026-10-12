/**
 * Блок «Информация о погрузке» формы заявки.
 *
 * Компонент без собственного состояния: значения приходят через props, правки
 * уходят наверх обработчиками — по одному на поле. Проверяем проводку
 * (каждое поле отдаёт своё значение в свой обработчик и ни в какой другой),
 * подписи, id, порядок и подсказки полей, работу меток (чипы) и подсветку
 * заполненных полей.
 *
 * Тесты появились вместе с переносом блока из `ShipmentFormPage.tsx`: до
 * переноса ни одно из шести полей не редактировалось в тестах — обработчики
 * в странице были непокрытыми. Перепутанные местами обработчики такой тест
 * обязан ронять. Блок — близнец `UnloadingGroup`: набор и порядок полей
 * совпадают, но имена, id и подписи у него свои, поэтому тесты отдельные.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoadingGroup } from "@/features/shipments/shipment-form/LoadingGroup";

type Values = {
  loadingCities: string[];
  addressLoading: string;
  contactLoadingName: string;
  loadingDateFrom: string;
  loadingDateTo: string;
  loadingTimeFrom: string;
};

const EMPTY: Values = {
  loadingCities: [],
  addressLoading: "",
  contactLoadingName: "",
  loadingDateFrom: "",
  loadingDateTo: "",
  loadingTimeFrom: "",
};

function renderGroup(values: Partial<Values> = {}) {
  const handlers = {
    onLoadingCitiesChange: vi.fn(),
    onAddressLoadingChange: vi.fn(),
    onContactLoadingNameChange: vi.fn(),
    onLoadingDateFromChange: vi.fn(),
    onLoadingDateToChange: vi.fn(),
    onLoadingTimeFromChange: vi.fn(),
  };
  const view = render(<LoadingGroup {...EMPTY} {...values} {...handlers} />);
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
    id: "ship-load-cities",
    label: "Города погрузки",
    handler: "onLoadingCitiesChange",
    kind: "token",
    typed: "Тверь",
    expected: ["Тверь"],
  },
  {
    id: "ship-addr-load",
    label: "Адрес погрузки",
    handler: "onAddressLoadingChange",
    kind: "text",
    typed: "Склад №7",
    expected: "Склад №7",
  },
  {
    id: "ship-load-name",
    label: "Контактное лицо на погрузке и телефон",
    handler: "onContactLoadingNameChange",
    kind: "text",
    typed: "Сидоров Сидор, +7 900 222-33-44",
    expected: "Сидоров Сидор, +7 900 222-33-44",
  },
  {
    id: "ship-load-date-from",
    label: "Дата погрузки с",
    handler: "onLoadingDateFromChange",
    kind: "date",
    typed: "2026-03-01",
    expected: "2026-03-01",
  },
  {
    id: "ship-load-date-to",
    label: "Дата погрузки по",
    handler: "onLoadingDateToChange",
    kind: "date",
    typed: "2026-03-02",
    expected: "2026-03-02",
  },
  {
    id: "ship-load-time-from",
    label: "Время",
    handler: "onLoadingTimeFromChange",
    kind: "text",
    typed: "07:45",
    expected: "07:45",
  },
];

describe("LoadingGroup", () => {
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
    expect(placeholder("ship-load-cities")).toBe("Город + Enter");
    expect(placeholder("ship-load-name")).toBe("Иванов Иван, +7 900 000-00-00");
    expect(placeholder("ship-load-time-from")).toBe("09:00");

    expect(document.getElementById("ship-load-date-from")).toHaveAttribute("type", "date");
    expect(document.getElementById("ship-load-date-to")).toHaveAttribute("type", "date");
    expect(document.getElementById("ship-addr-load")).not.toHaveAttribute("type", "date");
  });

  it("метки показываются чипами и убираются", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ loadingCities: ["Москва", "Тверь"] });

    expect(screen.getByText("Москва")).toBeVisible();
    expect(screen.getByText("Тверь")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Убрать Москва" }));
    expect(handlers.onLoadingCitiesChange).toHaveBeenCalledWith(["Тверь"]);
    expect(handlers.onAddressLoadingChange).not.toHaveBeenCalled();
  });

  it("новая метка добавляется к уже выбранным", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ loadingCities: ["Москва"] });

    await user.type(
      document.getElementById("ship-load-cities") as HTMLInputElement,
      "Тверь{Enter}",
    );

    expect(handlers.onLoadingCitiesChange).toHaveBeenCalledWith(["Москва", "Тверь"]);
  });

  it("собственного состояния нет: смена props сразу меняет поля", () => {
    const { rerender, handlers } = renderGroup({ addressLoading: "Склад №7" });
    expect(document.getElementById("ship-addr-load")).toHaveValue("Склад №7");

    rerender(<LoadingGroup {...EMPTY} {...handlers} addressLoading="Склад №9" />);

    expect(document.getElementById("ship-addr-load")).toHaveValue("Склад №9");
  });

  it("пустое поле без подсветки, заполненное — с подсветкой", () => {
    const { rerender, handlers } = renderGroup({ addressLoading: "" });
    const emptyField = document.getElementById("ship-addr-load") as HTMLInputElement;
    expect(emptyField.className).toContain("bg-transparent");

    rerender(<LoadingGroup {...EMPTY} {...handlers} addressLoading="Склад №7" />);

    expect(emptyField.className).toContain("bg-odoo-primary-soft/50");
  });
});
