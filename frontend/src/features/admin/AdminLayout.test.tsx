/**
 * Бэкенд и так отклоняет admin-ручки для не-админа (403) — это настоящая
 * защита. Но без клиентского редиректа человек, открывший /admin напрямую,
 * видел бы пустую панель и ворох ошибок вместо понятного перехода на главную.
 */
import { screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";

import { AdminLayout } from "./AdminLayout";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

let server: FakeServer | undefined;
afterEach(() => {
  server?.restore();
  server = undefined;
});

function renderAdminRoute() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<div>Главная</div>} />
      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<div>Страница администратора</div>} />
      </Route>
    </Routes>,
    { route: "/admin" },
  );
}

it("админ видит содержимое панели управления", async () => {
  server = startFakeApi([
    {
      path: "/auth/me",
      response: {
        id: 1,
        email: "admin@example.com",
        first_name: "Админ",
        last_name: "Админов",
        role: "admin",
        is_active: true,
      },
    },
  ]);

  renderAdminRoute();

  expect(await screen.findByText("Панель управления")).toBeVisible();
  expect(await screen.findByText("Страница администратора")).toBeVisible();
});

it("не-админа редиректит на главную, не показывая панель управления", async () => {
  server = startFakeApi([
    {
      path: "/auth/me",
      response: {
        id: 2,
        email: "manager@example.com",
        first_name: "Пётр",
        last_name: "Петров",
        role: "manager",
        is_active: true,
      },
    },
  ]);

  renderAdminRoute();

  expect(await screen.findByText("Главная")).toBeVisible();
  expect(screen.queryByText("Панель управления")).not.toBeInTheDocument();
});
