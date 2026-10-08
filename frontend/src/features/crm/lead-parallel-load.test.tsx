/**
 * Карточка лида запрашивает всё одним заходом.
 *
 * Раньше вложения и список заявок ждали ответа по самому лиду: номер брался из
 * загруженной карточки, хотя он есть в адресе страницы. Получался лишний круг
 * до сервера при каждом открытии. Проверяем, что теперь запросы уходят сразу,
 * даже если ответ по лиду задержался (здесь он вовсе не приходит — ошибка).
 */
import { waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { LeadFormPage } from "./LeadFormPage";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { ToastProvider } from "@/shared/ui/toast";
import { renderWithDataRouter } from "@/test/utils";

const ME = {
  id: 1,
  email: "admin@example.com",
  role: "admin",
  first_name: "А",
  last_name: "Б",
  is_active: true,
};

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

it("просит вложения и заявки, не дожидаясь ответа по самому лиду", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    { path: "/auth/me", response: ME },
    { path: "/crm/leads/10/timeline", response: [] },
    {
      path: "/crm/leads/10/pager",
      response: { position: 1, total: 1, prev_id: null, next_id: null },
    },
    { path: "/crm/leads/10/attachments", response: [] },
    { path: "/crm/stages", response: [] },
    { path: "/crm/tags", response: [] },
    { path: "/leads/10/shipments", response: [] },
    // Сам лид не отвечает — прежняя версия на этом и останавливалась.
    { path: "/crm/leads/10", status: 500, response: { detail: "Сервер занят" } },
  ]);

  renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  await waitFor(() => {
    expect(server?.called("GET", "/crm/leads/10/attachments")).toBe(true);
    expect(server?.called("GET", "/leads/10/shipments")).toBe(true);
  });
});

it("не дёргает сервер по несуществующему номеру на создании лида", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    { path: "/auth/me", response: ME },
    { path: "/crm/stages", response: [] },
    { path: "/crm/tags", response: [] },
  ]);

  renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/new" },
  );

  await waitFor(() => expect(server?.called("GET", "/crm/stages")).toBe(true));
  const paths = (server?.calls ?? []).map((call) => call.url);
  expect(paths.some((url) => url.includes("/new/attachments"))).toBe(false);
  expect(paths.some((url) => url.includes("/new/shipments"))).toBe(false);
});
