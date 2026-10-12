/**
 * Вкладка «Заявки» карточки лида.
 *
 * Компонент без собственного состояния и без запросов: список приходит
 * готовым через props, нажатие «Добавить заявку» уходит наверх обработчиком.
 * Проверяем проводку данных в колонки (значение не должно попадать «не в свою»
 * клетку), справочник статусов целиком, формат даты и прочерки, пустое
 * состояние и то, что кнопка отдаёт нажатие наружу.
 *
 * Тесты появились вместе с переносом таблицы из `LeadFormPage.tsx`: до
 * переноса строки таблицы не исполнялись ни одним тестом — проверялся только
 * пустой список. Ссылки на заявки требуют маршрутизатора, поэтому рендер
 * идёт в `MemoryRouter`.
 */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { ShipmentsTab } from "@/features/crm/lead-form/ShipmentsTab";
import type { ShipmentListItem } from "@/shared/types";

/**
 * Дата — полдень по Гринвичу: день «12.08.2026» остаётся тем же в любом
 * часовом поясе, поэтому проверка формата не зависит от машины.
 */
const FIRST: ShipmentListItem = {
  id: 501,
  number: "З-501",
  lead_id: 10,
  lead_name: "ООО Ромашка",
  tags: [],
  seller_name: "Админов Админ",
  status: "checked",
  route: "Москва — Казань",
  carrier_name: "ООО «Перевозчик»",
  created_at: "2026-08-12T12:00:00+00:00",
  margin: "15000.00",
  customer_total: "120000.00",
};

const SECOND: ShipmentListItem = {
  ...FIRST,
  id: 502,
  number: "З-502",
  seller_name: null,
  status: "loaded",
  route: "Санкт-Петербург — Тверь",
  carrier_name: "",
  created_at: "2026-09-01T12:00:00+00:00",
  margin: null,
  customer_total: null,
};

function renderTab(shipments: ShipmentListItem[] = [FIRST, SECOND]) {
  const onAddShipment = vi.fn();
  const view = render(
    <MemoryRouter>
      <ShipmentsTab shipments={shipments} onAddShipment={onAddShipment} />
    </MemoryRouter>,
  );
  return { ...view, onAddShipment };
}

describe("ShipmentsTab", () => {
  it("значения строк попадают в свои колонки, номер — ссылка на заявку", () => {
    renderTab();

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(3); // шапка и две заявки

    const first = rows[1]!;
    const cells = within(first).getAllByRole("cell");
    // Проверяем клетки по порядку: так перепутанное место видно сразу.
    expect(within(cells[0]!).getByRole("link", { name: "З-501" })).toHaveAttribute(
      "href",
      "/shipments/501",
    );
    expect(cells[1]!.textContent).toMatch(/^12\.08\.2026 \d{2}:\d{2}:\d{2}$/);
    expect(cells[2]).toHaveTextContent("Москва — Казань");
    expect(cells[3]).toHaveTextContent("ООО «Перевозчик»");
    expect(cells[4]).toHaveTextContent("Проверена и подписана заявка");
    // Маршрут дублируется подсказкой: полный текст виден при наведении.
    expect(cells[2]).toHaveAttribute("title", "Москва — Казань");

    const second = rows[2]!;
    const secondCells = within(second).getAllByRole("cell");
    expect(within(secondCells[0]!).getByRole("link", { name: "З-502" })).toHaveAttribute(
      "href",
      "/shipments/502",
    );
    expect(secondCells[1]!.textContent).toMatch(/^01\.09\.2026 \d{2}:\d{2}:\d{2}$/);
    expect(secondCells[2]).toHaveTextContent("Санкт-Петербург — Тверь");
    expect(secondCells[3]).toHaveTextContent("—");
    expect(secondCells[4]).toHaveTextContent("Машина загрузилась");
  });

  it("все четыре статуса показывают свою подпись и свой цвет", () => {
    const shipments = (
      [
        ["new", "Новая", "bg-odoo-tag-yellow-bg"],
        ["checked", "Проверена и подписана заявка", "bg-odoo-tag-blue-bg"],
        ["loaded", "Машина загрузилась", "bg-odoo-tag-green-bg"],
        ["unloaded", "Машина выгрузилась", "bg-odoo-tag-green-bg"],
      ] as const
    ).map(([status, , ,], index) => ({
      ...FIRST,
      id: 600 + index,
      number: `З-60${index}`,
      status,
    }));

    renderTab(shipments);

    const expected = [
      ["Новая", "bg-odoo-tag-yellow-bg"],
      ["Проверена и подписана заявка", "bg-odoo-tag-blue-bg"],
      ["Машина загрузилась", "bg-odoo-tag-green-bg"],
      ["Машина выгрузилась", "bg-odoo-tag-green-bg"],
    ] as const;

    const rows = screen.getAllByRole("row").slice(1);
    rows.forEach((row, index) => {
      const [label, cls] = expected[index]!;
      const badge = within(row).getByText(label);
      expect(badge).toHaveClass(cls);
      expect(badge).toHaveClass("rounded-[10px]");
    });
  });

  it("дата: нормальная форматируется, пустая и битая — прочерк", () => {
    const withDates = [
      { ...FIRST, id: 701, number: "З-701", created_at: "2026-08-12T12:00:00+00:00" },
      { ...FIRST, id: 702, number: "З-702", created_at: "" },
      { ...FIRST, id: 703, number: "З-703", created_at: "не дата" },
    ];
    // Пустая и нечитаемая дата через сеть не приходят: схема ответа их не
    // пропустит. Это подстраховка компонента, её и проверяем.
    renderTab(withDates);

    const cells = screen
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1]!);
    expect(cells[0]!.textContent).toMatch(/^12\.08\.2026 \d{2}:\d{2}:\d{2}$/);
    expect(cells[1]).toHaveTextContent("—");
    expect(cells[2]).toHaveTextContent("—");
  });

  it("пустое состояние: пояснение на всю ширину, ссылок нет, кнопка на месте", () => {
    const { onAddShipment } = renderTab([]);

    const rows = screen.getAllByRole("row");
    expect(rows).toHaveLength(2);
    const placeholder = within(rows[1]!).getByText("Пока нет заявок по этому лиду.");
    expect(placeholder).toHaveAttribute("colspan", "5");
    expect(within(rows[1]!).queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Добавить заявку" })).toBeVisible();
    expect(onAddShipment).not.toHaveBeenCalled();
  });

  it("порядок колонок и подписи прежние", () => {
    renderTab();

    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers).toEqual(["№", "Дата создания", "Маршрут", "Перевозчик", "Статус"]);
  });

  it("кнопка отдаёт нажатие наружу ровно один раз, клик по ссылке — нет", async () => {
    const user = userEvent.setup();
    const { onAddShipment } = renderTab();

    await user.click(screen.getByRole("button", { name: "Добавить заявку" }));
    expect(onAddShipment).toHaveBeenCalledTimes(1);
    expect(onAddShipment).toHaveBeenCalledWith();

    // Переход по ссылке — дело маршрутизатора, обработчик кнопки не трогается.
    await user.click(screen.getByRole("link", { name: "З-501" }));
    expect(onAddShipment).toHaveBeenCalledTimes(1);
  });

  it("собственного состояния нет: смена props сразу меняет таблицу", () => {
    const { rerender, onAddShipment } = renderTab([FIRST]);
    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "З-501" })).toBeVisible();

    rerender(
      <MemoryRouter>
        <ShipmentsTab shipments={[]} onAddShipment={onAddShipment} />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("row")).toHaveLength(2);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Пока нет заявок по этому лиду.")).toBeVisible();
  });
});
