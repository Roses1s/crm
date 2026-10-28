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

it("новая CRM — пустая белая страница без запросов к данным", async () => {
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
  expect(page).toHaveClass("min-h-screen", "bg-white");
  expect(window.location.pathname).toBe("/crm2");
  expect(server.calls).toEqual([]);
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
