/**
 * Блок «Сведения о перевозчике» формы заявки.
 *
 * Компонент без собственного состояния: значения приходят через props, правки
 * уходят наверх обработчиками — по одному на поле. Проверяем проводку (каждое
 * поле отдаёт своё значение в свой обработчик и ни в какой другой), подписи,
 * id, порядок, подсказки и свойства полей, условие показа «Номера прицепа»
 * и подсветку заполненных полей.
 *
 * Тесты появились вместе с переносом блока из `ShipmentFormPage.tsx`. Перепутанные
 * местами обработчики обязан ронять первый тест; условный «Номер прицепа» —
 * отдельный тест, потому что это единственное поле блока, которого на форме
 * может не быть вовсе.
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { CarrierGroup } from "@/features/shipments/shipment-form/CarrierGroup";

type Values = {
  carrierName: string;
  carrierInn: string;
  carrierContact: string;
  vehicle: string;
  vehicleNumber: string;
  hasTrailer: boolean;
  trailerNumber: string;
  driverName: string;
  driverPhone: string;
  driverPassport: string;
  carrierSigner: string;
};

const EMPTY: Values = {
  carrierName: "",
  carrierInn: "",
  carrierContact: "",
  vehicle: "",
  vehicleNumber: "",
  hasTrailer: false,
  trailerNumber: "",
  driverName: "",
  driverPhone: "",
  driverPassport: "",
  carrierSigner: "",
};

function renderGroup(values: Partial<Values> = {}) {
  const handlers = {
    onCarrierNameChange: vi.fn(),
    onCarrierInnChange: vi.fn(),
    onCarrierContactChange: vi.fn(),
    onVehicleChange: vi.fn(),
    onVehicleNumberChange: vi.fn(),
    onHasTrailerChange: vi.fn(),
    onTrailerNumberChange: vi.fn(),
    onDriverNameChange: vi.fn(),
    onDriverPhoneChange: vi.fn(),
    onDriverPassportChange: vi.fn(),
    onCarrierSignerChange: vi.fn(),
  };
  const view = render(<CarrierGroup {...EMPTY} {...values} {...handlers} />);
  return { ...view, handlers };
}

const FIELDS: {
  id: string;
  label: string;
  handler: keyof ReturnType<typeof renderGroup>["handlers"];
  kind: "text" | "checkbox";
  typed: string;
  expected: unknown;
  needsTrailer?: boolean;
}[] = [
  {
    id: "ship-carrier-name",
    label: "Перевозчик",
    handler: "onCarrierNameChange",
    kind: "text",
    typed: "ООО Транс",
    expected: "ООО Транс",
  },
  {
    id: "ship-carrier-inn",
    label: "ИНН перевозчика",
    handler: "onCarrierInnChange",
    kind: "text",
    typed: "7701234567",
    expected: "7701234567",
  },
  {
    id: "ship-carr-contact",
    label: "Контакт перевозчика",
    handler: "onCarrierContactChange",
    kind: "text",
    typed: "Иванов, +7 900 000-00-00",
    expected: "Иванов, +7 900 000-00-00",
  },
  {
    id: "ship-vehicle",
    label: "ТС (марка)",
    handler: "onVehicleChange",
    kind: "text",
    typed: "Volvo FH",
    expected: "Volvo FH",
  },
  {
    id: "ship-vehicle-num",
    label: "Номер ТС",
    handler: "onVehicleNumberChange",
    kind: "text",
    typed: "А123ВС77",
    expected: "А123ВС77",
  },
  {
    // Подпись поля — «Прицеп»; «Есть прицеп» — это aria-label самой галочки.
    id: "ship-has-trailer",
    label: "Прицеп",
    handler: "onHasTrailerChange",
    kind: "checkbox",
    typed: "Есть прицеп",
    // В этом прогоне прицеп уже включён, поэтому клик снимает галочку.
    expected: false,
  },
  {
    id: "ship-trailer-num",
    label: "Номер прицепа",
    handler: "onTrailerNumberChange",
    kind: "text",
    typed: "ЕК4567",
    expected: "ЕК4567",
    needsTrailer: true,
  },
  {
    id: "ship-driver-name",
    label: "ФИО водителя",
    handler: "onDriverNameChange",
    kind: "text",
    typed: "Сидоров Сидор",
    expected: "Сидоров Сидор",
  },
  {
    id: "ship-driver-phone",
    label: "Телефон водителя",
    handler: "onDriverPhoneChange",
    kind: "text",
    typed: "+7 900 111-22-33",
    expected: "+7 900 111-22-33",
  },
  {
    id: "ship-driver-pass",
    label: "Паспорт водителя",
    handler: "onDriverPassportChange",
    kind: "text",
    typed: "4509 123456",
    expected: "4509 123456",
  },
  {
    id: "ship-carr-signer",
    label: "Кто подписывает",
    handler: "onCarrierSignerChange",
    kind: "text",
    typed: "Директор Петров",
    expected: "Директор Петров",
  },
];

describe("CarrierGroup", () => {
  it("каждое поле отдаёт значение только своему обработчику", async () => {
    const user = userEvent.setup();
    // «Номер прицепа» есть на форме только с включённым прицепом.
    const { handlers } = renderGroup({ hasTrailer: true });

    for (const field of FIELDS) {
      for (const handler of Object.values(handlers)) handler.mockClear();

      const host = document.getElementById(field.id) as HTMLInputElement;
      if (field.kind === "checkbox") {
        await user.click(host);
      } else {
        // Обычное поле: вставляем значение целиком, чтобы обработчик получил
        // строку как в жизни (по буквам контролируемое поле отдаёт по одной).
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
    const { container } = renderGroup({ hasTrailer: true });

    const labels = FIELDS.map((field) => {
      const label = document.querySelector(`label[for="${field.id}"]`);
      return label?.textContent?.trim();
    });
    expect(labels).toEqual(FIELDS.map((field) => field.label));

    const rendered = [...container.querySelectorAll("input")].map((element) => element.id);
    expect(rendered).toEqual(FIELDS.map((field) => field.id));
  });

  it("подсказки и свойства полей сохранены", () => {
    renderGroup();

    const field = (id: string) => document.getElementById(id) as HTMLInputElement;
    expect(field("ship-carrier-name").getAttribute("placeholder")).toBe("Название компании");
    expect(field("ship-carrier-inn").getAttribute("placeholder")).toBe("10 или 12 цифр");
    expect(field("ship-driver-phone").getAttribute("placeholder")).toBe("+7 900 000-00-00");
    expect(field("ship-carrier-inn").getAttribute("inputmode")).toBe("numeric");
    expect(field("ship-carr-contact").getAttribute("placeholder")).toBeNull();
    expect(field("ship-vehicle").getAttribute("inputmode")).toBeNull();
  });

  it("«Номер прицепа» показывается только с отмеченным прицепом", async () => {
    const user = userEvent.setup();
    const { rerender, handlers } = renderGroup({ hasTrailer: false });

    expect(document.getElementById("ship-has-trailer")).not.toBeChecked();
    expect(document.getElementById("ship-trailer-num")).toBeNull();

    // Галочка сама наружу состояние не меняет — только сообщает о клике.
    await user.click(screen.getByRole("checkbox", { name: "Есть прицеп" }));
    expect(handlers.onHasTrailerChange).toHaveBeenCalledWith(true);
    expect(document.getElementById("ship-trailer-num")).toBeNull();

    rerender(<CarrierGroup {...EMPTY} {...handlers} hasTrailer trailerNumber="ЕК4567" />);
    expect(document.getElementById("ship-has-trailer")).toBeChecked();
    expect(document.getElementById("ship-trailer-num")).toHaveValue("ЕК4567");
  });

  it("собственного состояния нет: смена props сразу меняет поля", () => {
    const { rerender, handlers } = renderGroup({ carrierName: "ООО Транс" });
    expect(document.getElementById("ship-carrier-name")).toHaveValue("ООО Транс");

    rerender(<CarrierGroup {...EMPTY} {...handlers} carrierName="ООО Логистика" hasTrailer />);

    expect(document.getElementById("ship-carrier-name")).toHaveValue("ООО Логистика");
    expect(document.getElementById("ship-trailer-num")).not.toBeNull();
  });

  it("пустое поле без подсветки, заполненное — с подсветкой", () => {
    const { rerender, handlers } = renderGroup({ driverName: "" });
    const emptyField = document.getElementById("ship-driver-name") as HTMLInputElement;
    expect(emptyField.className).toContain("bg-transparent");

    rerender(<CarrierGroup {...EMPTY} {...handlers} driverName="Сидоров Сидор" />);

    expect(emptyField.className).toContain("bg-odoo-primary-soft/50");
  });
});
