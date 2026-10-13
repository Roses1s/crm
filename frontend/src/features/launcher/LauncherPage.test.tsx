import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { useLocation } from "react-router-dom";

import { LauncherPage } from "@/features/launcher/LauncherPage";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const CRM_APP = {
  id: 1,
  slug: "crm",
  name: "CRM",
  description: "Лиды, воронка продаж и карточки клиентов",
  icon: "Kanban",
  route: "/crm",
  min_role: "manager",
};

const ADMIN_APP = {
  id: 2,
  slug: "admin",
  name: "Администрирование",
  description: "Пользователи и безопасность",
  icon: "Settings",
  route: "/admin",
  min_role: "admin",
};

const MANAGER_APPS = [CRM_APP];
const ADMIN_APPS = [CRM_APP, ADMIN_APP];

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderLauncher(apps: unknown[]) {
  setAccessToken("тестовый-токен");
  server = startFakeApi([{ path: "/launcher/apps", response: apps }]);
  return renderWithProviders(
    <>
      <LauncherPage />
      <CurrentPath />
    </>,
  );
}

it("показывает приложения, полученные из API, и ведёт по их маршруту", async () => {
  const user = userEvent.setup();
  renderLauncher(MANAGER_APPS);

  const crm = await screen.findByRole("link", { name: /^CRM/ });
  expect(screen.getByRole("heading", { name: "Приложения" })).toBeVisible();
  expect(crm).toHaveAttribute("href", "/crm");
  expect(screen.queryByRole("link", { name: /^Администрирование/ })).not.toBeInTheDocument();

  await user.click(crm);
  expect(screen.getByTestId("current-path")).toHaveTextContent("/crm");
});

it("показывает административное приложение, если его вернул API", async () => {
  renderLauncher(ADMIN_APPS);

  // Список доступных плиток формирует сервер с учётом роли; страница
  // показывает ответ без собственной копии правил авторизации.
  expect(await screen.findByRole("link", { name: /^Администрирование/ })).toHaveAttribute(
    "href",
    "/admin",
  );
});

it("объясняет, когда для текущей роли нет приложений", async () => {
  renderLauncher([]);

  expect(await screen.findByText("Для вашей роли пока нет доступных приложений.")).toBeVisible();
});
