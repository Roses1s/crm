/**
 * Автосохранение карточки лида.
 *
 * Регрессия: при неудачном сохранении форма оставалась «грязной», эффект
 * перезапускался (в его зависимостях есть флаг «идёт сохранение») и браузер
 * повторял один и тот же неудачный запрос каждые три секунды, пока открыта
 * вкладка. Проверяем, что после ошибки повторов нет, а после правки руками
 * автосохранение снова работает.
 */
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { LeadFormPage } from "./LeadFormPage";
import { ACCOUNTANT_NAMES } from "@/features/crm/lead-form/accountant-options";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { ToastProvider } from "@/shared/ui/toast";
import { renderWithProviders } from "@/test/utils";

const ME = { id: 1, email: "admin@example.com", role: "admin", first_name: "А", last_name: "Б" };

const LEAD = {
  id: 10,
  name: "ООО Ромашка",
  inn: "7701234567",
  logist_contact: "Иван",
  logist_phone: "",
  logist_email: null,
  accountant_name: null as string | null,
  priority: 0,
  is_archived: false,
  stage_id: 1,
  stage_name: "Новый",
  assigned_to_id: 1,
  assigned_to_name: "Админов Админ",
  tags: [],
};

const STAGES = [{ id: 1, name: "Новый", sequence: 1, color: "" }];

function routes(leadResponse: unknown = LEAD) {
  return [
    { path: "/auth/me", response: ME },
    { path: "/crm/leads/10/timeline", response: [] },
    { path: "/crm/leads/10/pager", response: { position: 1, total: 1 } },
    { path: "/crm/leads/10/attachments", response: [] },
    { path: "/crm/leads/10", response: leadResponse },
    { path: "/crm/stages", response: STAGES },
    { path: "/crm/tags", response: [] },
    { path: "/crm/customers/by-inn", response: [] },
    { path: "/leads/10/shipments", response: [] },
  ];
}

let server: FakeServer | undefined;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  server?.restore();
  server = undefined;
  clearTokens();
});

function savesCount(): number {
  return (server?.calls ?? []).filter((c) => c.method === "PATCH").length;
}

it("после неудачного автосохранения запрос не повторяется бесконечно", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...routes(),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      status: 409,
      response: { detail: "Конфликт", code: "conflict" },
    },
  ]);

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithProviders(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  // Название лида показано и в шапке, и в поле формы — берём первое поле.
  const [name] = await screen.findAllByDisplayValue("ООО Ромашка");
  await user.type(name, "!");

  // Первая попытка — через 3 секунды простоя.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(savesCount()).toBe(1));

  // Ещё двадцать секунд: повторов быть не должно.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(savesCount()).toBe(1);
});

it("правка руками снова включает автосохранение", async () => {
  setAccessToken("токен");
  let attempt = 0;
  server = startFakeApi([
    ...routes(),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      response: (body: unknown) => {
        attempt += 1;
        return { ...LEAD, ...(body as object) };
      },
    },
  ]);

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithProviders(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  // Название лида показано и в шапке, и в поле формы — берём первое поле.
  const [name] = await screen.findAllByDisplayValue("ООО Ромашка");
  await user.type(name, "!");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(attempt).toBe(1));

  await user.type(name, "?");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(attempt).toBe(2));
});

it("бухгалтера выбирают из фиксированного списка, сохраняют и могут очистить", async () => {
  setAccessToken("токен");
  let current = { ...LEAD };
  server = startFakeApi([
    ...routes(() => current),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      response: (body: unknown) => {
        current = { ...current, ...(body as Partial<typeof LEAD>) };
        return current;
      },
    },
  ]);

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithProviders(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  const accountant = await screen.findByLabelText("Назначенный бухгалтер");
  expect(accountant).toHaveValue("");
  expect(
    within(accountant)
      .getAllByRole("option")
      .map((option) => option.textContent),
  ).toEqual(["Выбрать", ...ACCOUNTANT_NAMES]);

  await user.selectOptions(accountant, "Кузьмина Виктория Павловна");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(savesCount()).toBe(1));
  expect(current.accountant_name).toBe("Кузьмина Виктория Павловна");
  expect(server?.calls.find((call) => call.method === "PATCH")?.body).toMatchObject({
    accountant_name: "Кузьмина Виктория Павловна",
  });

  await user.selectOptions(accountant, "");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(savesCount()).toBe(2));
  expect(current.accountant_name).toBeNull();
  expect(server?.calls.filter((call) => call.method === "PATCH")[1]?.body).toMatchObject({
    accountant_name: null,
  });
});
