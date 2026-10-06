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

const ADMIN = {
  id: 99,
  email: "admin@crmdetroid.ru",
  first_name: "Анна",
  last_name: "Смирнова",
  role: "admin" as const,
  is_active: true,
};

const USERS = [
  {
    id: 2,
    email: "kuznetsov@crmdetroid.ru",
    first_name: "Денис",
    last_name: "Кузнецов",
    role: "manager" as const,
    is_active: true,
  },
];

const SHIPMENTS = [
  {
    id: 101,
    number: "101",
    lead_id: 10,
    lead_name: "ООО Ромашка",
    seller_name: "Мария Петрова",
    status: "new",
    route: "Москва — Казань",
    carrier_name: "ИП Сидоров",
    created_at: "2026-09-30T10:00:00+03:00",
    margin: "1500.00",
    customer_total: "122000.00",
  },
];

const TOTALS = {
  margin: "1500.00",
  customer_total: "122000.00",
};

/**
 * Ожидаемые строки денег считаем той же локалью, что и прод, но с одной
 * поправкой: toLocaleString("ru-RU") ставит между разрядами НЕразрывный
 * пробел (U+00A0), а testing-library при сравнении сворачивает пробелы в
 * тексте элемента до обычного. Поэтому в ожидании заменяем его на обычный.
 */
function formatMoney(value: number): string {
  return value
    .toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\u00A0/g, " ");
}

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

describe("Сценарий: список заявок", () => {
  it("показывает заявку с клиентом, перевозчиком, маржой и итогами", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/auth/me", response: ME },
      { path: "/shipments", response: { ...page(SHIPMENTS), totals: TOTALS } },
    ]);

    renderWithProviders(
      <Routes>
        <Route path="/shipments" element={<ShipmentsPage />} />
        <Route path="/shipments/:id" element={<div>Карточка заявки открыта</div>} />
      </Routes>,
      { route: "/shipments" },
    );

    expect(await screen.findByText("ООО Ромашка", undefined, { timeout: 5000 })).toBeVisible();
    expect(screen.getByText("ИП Сидоров")).toBeVisible();
    // Номер — настоящая ссылка (можно открыть в новой вкладке, скопировать
    // адрес и т.д.), а не просто текст с обработчиком клика.
    const link = screen.getByRole("link", { name: "101" });
    expect(link).toHaveAttribute("href", "/shipments/101");

    // Маржа и «Всего» приходят с сервера готовыми — фронтенд только
    // форматирует. Каждая сумма видна дважды: в строке заявки и в «Итого».
    // Суммы «без НДС» на экране нет — владелец попросил убрать.
    expect(screen.getAllByText(formatMoney(1500))).toHaveLength(2);
    expect(screen.getAllByText(formatMoney(122000))).toHaveLength(2);
    expect(screen.queryByText(/без НДС/)).not.toBeInTheDocument();
    expect(screen.getByText("Итого")).toBeVisible();

    // Но и вся строка кликабельна — клик по любой другой ячейке тоже ведёт
    // на карточку заявки.
    const user = userEvent.setup();
    await user.click(screen.getByText("ООО Ромашка"));
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
    await screen.findByText("ООО Ромашка", undefined, { timeout: 5000 });

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
    await screen.findByText("ООО Ромашка", undefined, { timeout: 5000 });

    const before = server.calls.filter((call) => call.url.includes("/shipments")).length;
    await user.type(screen.getByPlaceholderText(/Поиск/i), "Ромашка");

    // Менеджеру подсказки о сотрудниках не показываются — отбор админский.
    expect(screen.queryByText("Сотрудники")).not.toBeInTheDocument();

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

  it("предупреждает, когда показаны не все заявки", async () => {
    // Пагинации в интерфейсе нет: сервер отдаёт первую страницу. Раньше
    // остальные записи просто исчезали, и об этом никто не знал.
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/auth/me", response: ME },
      {
        path: "/shipments",
        response: { count: 240, next: 2, previous: null, results: SHIPMENTS },
      },
    ]);

    renderWithProviders(
      <Routes>
        <Route path="/shipments" element={<ShipmentsPage />} />
      </Routes>,
      { route: "/shipments" },
    );

    expect(await screen.findByRole("status")).toHaveTextContent(/Показаны первые 1 заявок из 240/);
  });

  it("админ находит заявки сотрудника через общий поиск", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/auth/me", response: ADMIN },
      { path: "/admin/users", response: USERS },
      { path: "/shipments", response: { ...page(SHIPMENTS), totals: TOTALS } },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<ShipmentsPage />, { route: "/shipments" });
    await screen.findByText("ООО Ромашка", undefined, { timeout: 5000 });

    // Набираем фамилию — под полем поиска появляются подсказки, как на доске.
    await user.type(screen.getByPlaceholderText(/Поиск/i), "Кузнецов");
    const suggestion = await screen.findByRole("button", { name: /Кузнецов Денис/ });
    expect(suggestion).toBeVisible();

    // Клик — список перезагружается заявками сотрудника, поиск очищается.
    await user.click(suggestion);
    await waitFor(
      () => expect(server?.calls.some((call) => call.url.includes("assigned_to=2"))).toBe(true),
      { timeout: 3000 },
    );
    expect(await screen.findByText(/Заявки сотрудника: Кузнецов Денис/)).toBeVisible();
    expect((screen.getByPlaceholderText(/Поиск/i) as HTMLInputElement).value).toBe("");

    // «Показать все» снимает отбор сотрудника.
    await user.click(screen.getByRole("button", { name: /показать все/ }));
    await waitFor(() => {
      const calls = server?.calls.filter((call) => call.url.includes("/shipments")) ?? [];
      const last = calls[calls.length - 1];
      expect(last && !last.url.includes("assigned_to=")).toBe(true);
    });
    expect(screen.queryByText(/Заявки сотрудника/)).not.toBeInTheDocument();
  });
});
