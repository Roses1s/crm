/**
 * Блок «Информация о грузе» формы заявки.
 *
 * Компонент без собственного состояния: значения приходят через props, правки
 * уходят наверх обработчиками — по одному на поле. Проверяем именно проводку
 * (каждое поле отдаёт своё значение в свой обработчик и ни в какой другой),
 * подписи, id и порядок полей, полный набор вариантов транспорта, работу
 * меток (чипы) и подсветку заполненных полей.
 *
 * Тесты появились вместе с переносом блока из `ShipmentFormPage.tsx`: до
 * переноса ни одно из восьми полей ни разу не редактировалось в тестах —
 * обработчики в странице были непокрытыми. Поэтому проверяем не «элементы
 * есть», а что правка уходит правильному получателю: перепутанные местами
 * обработчики такой тест обязаны ронять.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CargoGroup } from "@/features/shipments/shipment-form/CargoGroup";

type Values = {
  cargoType: string;
  cargoPackaging: string;
  cargoVolume: string;
  cargoWeight: string;
  capacity: string;
  bodyType: string[];
  loadingMethod: string[];
  transportType: string;
};

const EMPTY: Values = {
  cargoType: "",
  cargoPackaging: "",
  cargoVolume: "",
  cargoWeight: "",
  capacity: "",
  bodyType: [],
  loadingMethod: [],
  transportType: "tent",
};

function renderGroup(values: Partial<Values> = {}) {
  const handlers = {
    onCargoTypeChange: vi.fn(),
    onCargoPackagingChange: vi.fn(),
    onCargoVolumeChange: vi.fn(),
    onCargoWeightChange: vi.fn(),
    onCapacityChange: vi.fn(),
    onBodyTypeChange: vi.fn(),
    onLoadingMethodChange: vi.fn(),
    onTransportTypeChange: vi.fn(),
  };
  const view = render(<CargoGroup {...EMPTY} {...values} {...handlers} />);
  return { ...view, handlers };
}

const FIELDS: {
  id: string;
  label: string;
  handler: keyof ReturnType<typeof renderGroup>["handlers"];
  kind: "input" | "token" | "select";
  typed: string;
  expected: unknown;
}[] = [
  {
    id: "ship-cargo-type",
    label: "Тип груза",
    handler: "onCargoTypeChange",
    kind: "input",
    typed: "Химгрузы",
    expected: "Химгрузы",
  },
  {
    id: "ship-cargo-pack",
    label: "Упаковка",
    handler: "onCargoPackagingChange",
    kind: "input",
    typed: "Биг-бэги",
    expected: "Биг-бэги",
  },
  {
    id: "ship-volume",
    label: "Объём кузова, м³",
    handler: "onCargoVolumeChange",
    kind: "input",
    typed: "92,5",
    expected: "92,5",
  },
  {
    id: "ship-weight",
    label: "Вес груза, т",
    handler: "onCargoWeightChange",
    kind: "input",
    typed: "21",
    expected: "21",
  },
  {
    id: "ship-capacity",
    label: "Грузоподъёмность, т",
    handler: "onCapacityChange",
    kind: "input",
    typed: "22",
    expected: "22",
  },
  {
    id: "ship-body-type",
    label: "Тип кузова",
    handler: "onBodyTypeChange",
    kind: "token",
    typed: "изотерм",
    expected: ["изотерм"],
  },
  {
    id: "ship-load-method",
    label: "Способ погрузки",
    handler: "onLoadingMethodChange",
    kind: "token",
    typed: "боковая",
    expected: ["боковая"],
  },
  {
    id: "ship-transport",
    label: "Тип транспорта",
    handler: "onTransportTypeChange",
    kind: "select",
    typed: "ref",
    expected: "ref",
  },
];

describe("CargoGroup", () => {
  it("каждое поле отдаёт значение только своему обработчику", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup();

    for (const field of FIELDS) {
      for (const handler of Object.values(handlers)) handler.mockClear();

      const host = document.getElementById(field.id) as HTMLInputElement;
      if (field.kind === "select") {
        await user.selectOptions(host, field.typed);
      } else if (field.kind === "token") {
        // Ввод метки: у TokenField собственный черновик, Enter его фиксирует.
        await user.type(host, `${field.typed}{Enter}`);
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
    renderGroup();

    const labels = FIELDS.map((field) => {
      const label = document.querySelector(`label[for="${field.id}"]`);
      return label?.textContent?.trim();
    });
    expect(labels).toEqual(FIELDS.map((field) => field.label));

    // Поля идут ровно в прежнем порядке и с прежними id.
    const ids = FIELDS.map((field) => field.id);
    const rendered = [...document.querySelectorAll("input[id^='ship-'], select[id^='ship-']")].map(
      (element) => element.id,
    );
    expect(rendered).toEqual(ids);
  });

  it("варианты транспорта на месте и показывают выбранное", () => {
    renderGroup({ transportType: "gazel" });

    const select = document.getElementById("ship-transport") as HTMLSelectElement;
    expect([...select.options].map((option) => [option.value, option.textContent])).toEqual([
      ["ft_20", "Фура 20т"],
      ["ft_40", "Фура 40т"],
      ["ref", "Рефрижератор"],
      ["tent", "Тент"],
      ["gazel", "Газель"],
      ["other", "Другое"],
    ]);
    expect(select.value).toBe("gazel");
  });

  it("метки показываются чипами и убираются", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ bodyType: ["изотерм", "тент"], loadingMethod: ["задняя"] });

    expect(screen.getByText("изотерм")).toBeVisible();
    expect(screen.getByText("тент")).toBeVisible();
    expect(screen.getByText("задняя")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Убрать изотерм" }));
    expect(handlers.onBodyTypeChange).toHaveBeenCalledWith(["тент"]);
    expect(handlers.onLoadingMethodChange).not.toHaveBeenCalled();
  });

  it("новая метка добавляется к уже выбранным", async () => {
    const user = userEvent.setup();
    const { handlers } = renderGroup({ bodyType: ["изотерм"] });

    await user.type(document.getElementById("ship-body-type") as HTMLInputElement, "борт{Enter}");

    expect(handlers.onBodyTypeChange).toHaveBeenCalledWith(["изотерм", "борт"]);
    expect(handlers.onLoadingMethodChange).not.toHaveBeenCalled();
  });

  it("собственного состояния нет: смена props сразу меняет поля", () => {
    const { rerender, handlers } = renderGroup({ cargoType: "Паллеты", transportType: "tent" });
    expect(document.getElementById("ship-cargo-type")).toHaveValue("Паллеты");

    rerender(<CargoGroup {...EMPTY} {...handlers} cargoType="Химгрузы" transportType="ref" />);

    expect(document.getElementById("ship-cargo-type")).toHaveValue("Химгрузы");
    expect(document.getElementById("ship-transport")).toHaveValue("ref");
  });

  it("пустое поле без подсветки, заполненное — с подсветкой и местом под стрелку", () => {
    const { rerender, handlers } = renderGroup({ cargoType: "", transportType: "" });
    const emptyInput = document.getElementById("ship-cargo-type") as HTMLInputElement;
    const emptySelect = document.getElementById("ship-transport") as HTMLSelectElement;
    expect(emptyInput.className).toContain("bg-transparent");
    expect(emptySelect.className).toContain("bg-transparent");
    expect(emptySelect.className).toContain("pr-6");

    rerender(<CargoGroup {...EMPTY} {...handlers} cargoType="Паллеты" transportType="tent" />);

    expect(emptyInput.className).toContain("bg-odoo-primary-soft/50");
    expect(emptySelect.className).toContain("bg-odoo-primary-soft/50");
  });
});
