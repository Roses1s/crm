/**
 * Сценарий «список заявок».
 *
 * Как и в других сценарных тестах, подменяется только сеть: страница делает
 * настоящие запросы, строит таблицу и меняет отбор по этапу через адрес.
 */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { ShipmentsPage } from "@/features/shipments/ShipmentsPage";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { page, startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const ME = {
  id: 1,
  email: "manager@crmdetroid.ru",
  first_name: "Мария",
  last_name: "Петрова",
  role: "manager" as const,
  is_active: true,
};

const SHIPMENTS = [
  {
    id: 101,
    number: "101",
    lead_id: 10,
    lead_name: "ООО Ромашка",
    seller_name: "Мария Петрова",
    status: "new",
    route: "Москва — Казань",
    carrier_id: null,
    carrier_name: "ИП Сидоров",
    created_at: "2026-09-30T10:00:00+03:00",
  },
];

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

describe("Сценарий: список заявок", () => {
  it("показывает заявку с маршрутом, клиентом и перевозчиком", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/auth/me", response: ME },
      { path: "/shipments", response: page(SHIPMENTS) },
    ]);

    renderWithProviders(
      <Routes>
        <Route path="/shipments" element={<ShipmentsPage />} />
        <Route path="/shipments/:id" element={<div>Карточка заявки открыта</div>} />
      </Routes>,
      { route: "/shipments" },
    );

    expect(await screen.findByText("Москва — Казань", undefined, { timeout: 5000 })).toBeVisible();
    expect(screen.getByText("ООО Ромашка")).toBeVisible();
    expect(screen.getByText("ИП Сидоров")).toBeVisible();
    // Номер — настоящая ссылка (можно открыть в новой вкладке, скопировать
    // адрес и т.д.), а не просто текст с обработчиком клика.
    const link = screen.getByRole("link", { name: "101" });
    expect(link).toHaveAttribute("href", "/shipments/101");

    // Но и вся строка кликабельна — клик по любой другой ячейке тоже ведёт
    // на карточку заявки.
    const user = userEvent.setup();
    await user.click(screen.getByText("Москва — Казань"));
    expect(await screen.findByText("Карточка заявки открыта")).toBeVisible();
  });

  it("пустой ответ сервера -> понятная надпись вместо пустой таблицы", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/auth/me", response: ME },
      { path: "/shipments", response: page([]) },
    ]);

    renderWithProviders(<ShipmentsPage />, { route: "/shipments" });

    expect(await screen.findByText("Заявок нет.", undefined, { timeout: 5000 })).toBeVisible();
  });

  it("выбор этапа отправляется на сервер как отбор", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/auth/me", response: ME },
      { path: "/shipments", response: page(SHIPMENTS) },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<ShipmentsPage />, { route: "/shipments" });
    await screen.findByText("Москва — Казань", undefined, { timeout: 5000 });

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "loaded");

    await waitFor(() =>
      expect(server?.calls.some((call) => call.url.includes("status=loaded"))).toBe(true),
    );
  });

  it("поиск уходит в запрос с задержкой (не на каждое нажатие клавиши)", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/auth/me", response: ME },
      { path: "/shipments", response: page(SHIPMENTS) },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<ShipmentsPage />, { route: "/shipments" });
    await screen.findByText("Москва — Казань", undefined, { timeout: 5000 });

    const before = server.calls.filter((call) => call.url.includes("/shipments")).length;
    await user.type(screen.getByPlaceholderText(/Поиск/i), "Ромашка");

    // Сразу после ввода новый запрос ещё не ушёл — это и есть дебаунс.
    expect(server.calls.filter((call) => call.url.includes("/shipments")).length).toBe(before);

    await waitFor(
      () =>
        expect(
          server?.calls.some(
            (call) => call.url.includes("/shipments") && call.url.includes("search="),
          ),
        ).toBe(true),
      { timeout: 3000 },
    );
  });
});
