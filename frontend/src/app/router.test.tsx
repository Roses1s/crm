import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { startFakeApi, type FakeServer } from "@/test/fake-api";

const ADMIN = {
  id: 1,
  email: "admin@example.com",
  first_name: "Анна",
  last_name: "Администратор",
  role: "admin",
  is_active: true,
};

const ADMIN_APPS = [
  {
    id: 1,
    slug: "crm",
    name: "CRM",
    description: "Лиды и воронка продаж",
    icon: "Kanban",
    route: "/crm",
    min_role: "manager",
  },
  {
    id: 2,
    slug: "admin",
    name: "Администрирование",
    description: "Пользователи и безопасность",
    icon: "Settings",
    route: "/admin",
    min_role: "admin",
  },
];

let server: FakeServer | undefined;
let modules: AppModules | undefined;

afterEach(() => {
  modules?.cleanup();
  modules = undefined;
  server?.restore();
  server = undefined;
  window.history.replaceState({}, "", "/");
});

async function loadModules() {
  // router.tsx создаёт настоящий BrowserRouter на уровне модуля и считывает
  // текущий URL при создании. Задаём начальный путь перед импортом.
  vi.resetModules();
  const rtl = await import("@testing-library/react");
  const { AppRouter } = await import("@/app/router");
  const { Providers } = await import("@/app/providers");
  const auth = await import("@/shared/api/auth");
  const loaded = { ...rtl, AppRouter, Providers, auth };
  modules = loaded;
  return loaded;
}

type AppModules = Awaited<ReturnType<typeof loadModules>>;

it("неизвестный адрес ведёт в лаунчер, а /admin — на вложенный список пользователей", async () => {
  window.history.replaceState({}, "", "/unknown-page");
  server = startFakeApi([
    { path: "/auth/me", response: ADMIN },
    { path: "/launcher/apps", response: ADMIN_APPS },
    { path: "/admin/users", response: [] },
  ]);

  const app = await loadModules();
  app.auth.setAccessToken("тестовый-токен");
  app.render(
    <app.Providers>
      <app.AppRouter />
    </app.Providers>,
  );

  expect(await app.screen.findByRole("heading", { name: "Приложения" })).toBeVisible();
  expect(window.location.pathname).toBe("/");

  const user = userEvent.setup();
  const adminApp = await app.screen.findByRole("link", { name: /^Администрирование/ });
  await user.click(adminApp);

  expect(await app.screen.findByRole("heading", { name: "Пользователи" })).toBeVisible();
  expect(window.location.pathname).toBe("/admin/users");
  expect(server?.called("GET", "/admin/users")).toBe(true);
}, 15_000);

it("новая CRM показывает макет панели без запросов к данным", async () => {
  window.history.replaceState({}, "", "/crm2");
  server = startFakeApi([]);
  const app = await loadModules();
  app.auth.setAccessToken("тестовый-токен");
  app.render(
    <app.Providers>
      <app.AppRouter />
    </app.Providers>,
  );

  const page = app.screen.getByRole("main", { name: "Новая CRM" });
  expect(page).toBeEmptyDOMElement();
  expect(app.screen.getByRole("complementary", { name: "Боковая панель — пример" })).toBeVisible();
  expect(app.screen.getByText("CRM Детроид")).toBeVisible();
  expect(app.screen.getByText("Доска лидов")).toBeVisible();
  expect(app.screen.getByText("Клиенты")).toBeVisible();
  expect(app.screen.getByText("Аналитика")).toBeVisible();
  expect(app.screen.getByText("Сделки")).toBeVisible();
  expect(app.screen.getByText("Календарь")).toBeVisible();
  expect(app.screen.getByText("Настройки")).toBeVisible();
  expect(app.screen.getAllByText("17")).toHaveLength(2);
  expect(app.screen.getAllByText("СКОРО")).toHaveLength(4);
  expect(app.screen.getByText("86%")).toBeVisible();
  expect(app.screen.getByText("Тёмная тема")).toBeVisible();
  expect(app.screen.getByText("Анна Ким")).toBeVisible();
  expect(app.screen.queryByRole("button")).not.toBeInTheDocument();
  expect(app.screen.queryByRole("link")).not.toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(app.screen.getByText("Клиенты"));
  await user.click(app.screen.getByText("Тёмная тема"));
  expect(window.location.pathname).toBe("/crm2");
  expect(server.calls).toEqual([]);
});

it("после обновления новая CRM восстанавливает вход, но данные не запрашивает", async () => {
  window.history.replaceState({}, "", "/crm2");
  server = startFakeApi([
    {
      method: "POST",
      path: "/auth/refresh",
      response: { access_token: "тестовый-токен", token_type: "bearer", expires_in: 1800 },
    },
  ]);
  const app = await loadModules();
  app.render(
    <app.Providers>
      <app.AppRouter />
    </app.Providers>,
  );

  expect(await app.screen.findByText("CRM Детроид")).toBeVisible();
  expect(server.calls.map(({ method, url }) => ({ method, url }))).toEqual([
    { method: "POST", url: "/api/v1/auth/refresh" },
  ]);
});

it("новая CRM без входа перенаправляет на существующий экран авторизации", async () => {
  window.history.replaceState({}, "", "/crm2");
  server = startFakeApi([{ method: "POST", path: "/auth/refresh", response: {}, status: 401 }]);
  const app = await loadModules();
  app.render(
    <app.Providers>
      <app.AppRouter />
    </app.Providers>,
  );

  expect(
    await app.screen.findByRole("heading", { name: "CRM Детроид" }, { timeout: 3000 }),
  ).toBeVisible();
  expect(window.location.pathname).toBe("/login");
  expect(app.screen.queryByRole("main", { name: "Новая CRM" })).not.toBeInTheDocument();
  expect(
    server.calls.every((call) => call.method === "POST" && call.url === "/api/v1/auth/refresh"),
  ).toBe(true);
});
