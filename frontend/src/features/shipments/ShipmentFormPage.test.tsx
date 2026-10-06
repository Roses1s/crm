/**
 * Дата создания заявки — редактируемое поле (заявку часто заводят в CRM
 * позже, чем она реально возникла, и нужно уметь её исправить задним числом).
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { ShipmentFormPage } from "./ShipmentFormPage";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { page, startFakeApi, type FakeServer } from "@/test/fake-api";
import { ToastProvider } from "@/shared/ui/toast";
import { renderWithProviders } from "@/test/utils";

const ME = {
  id: 1,
  email: "manager@crmdetroid.ru",
  first_name: "Мария",
  last_name: "Петрова",
  role: "manager" as const,
  is_active: true,
};

const SHIPMENT = {
  id: 101,
  number: "101",
  lead_id: 10,
  lead_name: "ООО «Ромашка»",
  seller_name: "Мария Петрова",
  status: "new",
  transport_type: "tent",
  route: "Москва — Казань",
  carrier_name: "",
  carrier_inn: "",
  created_at: "2026-01-15T09:30:00+00:00",
  loading_cities: [],
  unloading_cities: [],
  body_type: [],
  loading_method: [],
  tags: [],
};

let server: FakeServer | undefined;
afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

function commonRoutes() {
  return [
    { path: "/auth/me", response: ME },
    { path: "/meta", response: { margin_deduction_rate: "0.25" } },
    { path: "/shipments/101/attachments", response: [] },
    { path: "/shipments/101/timeline", response: [] },
    { path: "/shipments/101", response: SHIPMENT },
    { path: "/crm/leads", response: page([]) },
    { path: "/crm/tags", response: [] },
  ];
}

function renderShipment() {
  return renderWithProviders(
    <ToastProvider>
      <Routes>
        <Route path="/shipments/:id" element={<ShipmentFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/shipments/101" },
  );
}

it("дата создания заполняется из карточки заявки", async () => {
  setAccessToken("токен");
  server = startFakeApi(commonRoutes());

  renderShipment();

  const input = (await screen.findByLabelText("Дата создания")) as HTMLInputElement;
  // В часовом поясе теста (UTC) совпадает буквально; важно само наличие
  // значения — поле не должно оставаться пустым у уже сохранённой заявки.
  await waitFor(() => expect(input.value).toBe("2026-01-15T09:30"));
});

it("изменённая дата создания уходит на сервер при сохранении", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  const input = (await screen.findByLabelText("Дата создания")) as HTMLInputElement;
  await waitFor(() => expect(input.value).toBe("2026-01-15T09:30"));

  await user.clear(input);
  await user.type(input, "2025-12-01T00:00");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/shipments/101")).toBe(true));
  const patch = server.calls.find((c) => c.method === "PATCH" && c.url.includes("/shipments/101"));
  expect((patch?.body as { created_at?: string })?.created_at).toBe(
    new Date("2025-12-01T00:00").toISOString(),
  );
});

it("маржа на вкладке «Позиции заказа» считается по ставке с сервера (Т-08)", async () => {
  setAccessToken("токен");
  // Ставку вычета форма знает только из ответа /meta — локальной копии нет.
  server = startFakeApi(commonRoutes());

  const user = userEvent.setup();
  renderShipment();

  await user.click(await screen.findByRole("button", { name: "Позиции заказа" }));
  await user.type(await screen.findByLabelText("Цена для заказчика"), "122000");
  // У перевозчика НДС нет: «Без НДС» выбираем во втором налоговом списке
  // (первый — у заказчика; на странице есть и другие выпадающие списки).
  const noVatOptions = screen.getAllByRole("option", { name: "Без НДС" });
  const carrierTaxSelect = noVatOptions[1].closest("select");
  expect(carrierTaxSelect).not.toBeNull();
  await user.selectOptions(carrierTaxSelect!, "no_vat");
  await user.type(await screen.findByLabelText("Цена для перевозчика"), "80000");

  // 122 000 с НДС 22% — это 100 000 без НДС; (100 000 − 80 000) × 0,75 = 15 000.
  // ru-RU группирует разряды неразрывным пробелом (U+00A0) — сравниваем сами.
  await screen.findByText(
    (_content, element) =>
      element?.tagName === "SPAN" && element.textContent?.replace(/\u00A0/g, " ") === "15 000,00",
  );
});
