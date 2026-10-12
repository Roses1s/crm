/**
 * Автосохранение карточки лида.
 *
 * Регрессия: при неудачном сохранении форма оставалась «грязной», эффект
 * перезапускался (в его зависимостях есть флаг «идёт сохранение») и браузер
 * повторял один и тот же неудачный запрос каждые три секунды, пока открыта
 * вкладка. Проверяем, что после ошибки повторов нет, а после правки руками
 * автосохранение снова работает.
 *
 * Важно: проверка «после ошибки повторов нет» имеет смысл только с ответом
 * сервера, приходящим с задержкой (см. slowResponses ниже).
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
import { renderWithDataRouter } from "@/test/utils";

const ME = {
  id: 1,
  email: "admin@example.com",
  role: "admin",
  first_name: "А",
  last_name: "Б",
  is_active: true,
};

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
  loss_reason_id: null,
  loss_reason_name: null,
  stage_id: 1,
  stage_name: "Новый",
  assigned_to_id: 1,
  assigned_to_email: "admin@example.com",
  assigned_to_name: "Админов Админ",
  tags: [],
  created_at: "2026-10-01T10:00:00+03:00",
  updated_at: "2026-10-01T10:00:00+03:00",
};

const STAGES = [{ id: 1, name: "Новый", sequence: 1, color: "" }];

function routes(leadResponse: unknown = LEAD) {
  return [
    { path: "/auth/me", response: ME },
    { path: "/crm/leads/10/timeline", response: [] },
    {
      path: "/crm/leads/10/pager",
      response: { position: 1, total: 1, prev_id: null, next_id: null },
    },
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

/** Тело последнего сохранения — что именно отправили на сервер. */
function lastSaveBody(): Record<string, unknown> {
  const call = [...(server?.calls ?? [])]
    .reverse()
    .find((c) => c.method === "PATCH" && c.url.includes("/crm/leads/10"));
  return (call?.body ?? {}) as Record<string, unknown>;
}

/**
 * Настоящий сервер отвечает не мгновенно, и здесь это принципиально: пока
 * запрос в пути, форма успевает отрисоваться в состоянии «идёт сохранение»,
 * а после ответа эффект автосохранения перезапускается. Именно на этом
 * перезапуске и держится запрет повторов после ошибки. С мгновенным ответом
 * React склеивает «идёт сохранение» и «ошибка» в одну отрисовку, эффект не
 * перезапускается вовсе — и проверка проходила даже с удалённым запретом
 * (воспроизведено подстановкой поломки в LeadFormPage.tsx).
 */
function slowResponses(ms = 400) {
  const fakeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return fakeFetch(input, init);
  });
}

/**
 * Первое сохранение отвечает ошибкой — ответ всё равно приходит с задержкой
 * (её делает slowResponses), чтобы форма успела побывать в состоянии «идёт
 * сохранение» и эффект после ответа перезапустился, упёршись в запрет повторов.
 * Без настоящей неудачи проверять восстановление нечего: запрет взводится
 * только обработчиком ошибки.
 *
 * Запрос сначала пропускаем до поддельного сервера (иначе попытка не попала бы
 * в журнал `server.calls`), а успешный ответ подменяем отказом.
 */
function failFirstSave() {
  const fakeFetch = globalThis.fetch;
  let failed = false;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await fakeFetch(input, init);
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    if (!failed && method === "PATCH" && url.includes("/crm/leads/10")) {
      failed = true;
      return new Response(JSON.stringify({ detail: "Конфликт", code: "conflict" }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }
    return response;
  });
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
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithDataRouter(
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

  // Первая попытка — через 3 секунды простоя — должна упасть и показать причину.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(savesCount()).toBe(1));
  expect(await screen.findByRole("alert")).toHaveTextContent("Конфликт");

  // Ещё двадцать секунд: без запрета повторов эффект перезапускался бы каждые
  // три секунды — за это окно набралось бы шесть повторов.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(savesCount()).toBe(1);
});

it("правка руками после неудачного автосохранения снова запускает сохранение", async () => {
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
  slowResponses();
  failFirstSave();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithDataRouter(
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

  // Первая попытка падает: причина видна, форма ждёт правки руками.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(savesCount()).toBe(1));
  expect(await screen.findByRole("alert")).toHaveTextContent("Конфликт");

  // Пока правок нет — повторов быть не должно: иначе следующая проверка
  // («после правки снова работает») ничего бы не доказывала — запросы шли бы
  // и сами по себе.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(savesCount()).toBe(1);

  // Правка руками снимает запрет: через три секунды простоя уходит второй
  // запрос — уже с новым значением, и на этот раз успешный.
  await user.type(name, "?");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(savesCount()).toBe(2));
  expect(lastSaveBody().name).toBe("ООО Ромашка!?");

  // Причина ошибки сменяется подтверждением, и после успеха повторов нет.
  expect(await screen.findByText("Сохранено")).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(savesCount()).toBe(2);
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
  renderWithDataRouter(
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
  renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  const accountant = await screen.findByLabelText("Назначенный бухгалтер");
  const accountantLabel = screen.getByText("Назначенный бухгалтер");
  expect(accountantLabel.parentElement).toHaveClass("items-center");
  const priorityLabel = screen.getByText("Приоритет");
  const tagsLabel = screen.getByText("Теги");
  expect(
    accountantLabel.compareDocumentPosition(priorityLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(
    priorityLabel.compareDocumentPosition(tagsLabel) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
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
    expected_updated_at: LEAD.updated_at,
  });

  await user.selectOptions(accountant, "");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(savesCount()).toBe(2));
  expect(current.accountant_name).toBeNull();
  expect(server?.calls.filter((call) => call.method === "PATCH")[1]?.body).toMatchObject({
    accountant_name: null,
    expected_updated_at: LEAD.updated_at,
  });
});

it("при конфликте блокирует старую форму и даёт загрузить актуальную карточку", async () => {
  setAccessToken("токен");
  const latest = {
    ...LEAD,
    name: "Новое название от коллеги",
    updated_at: "2026-10-01T11:00:00+03:00",
  };
  server = startFakeApi([
    ...routes(latest),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      status: 409,
      response: { detail: "Карточка изменилась", code: "lead_conflict" },
    },
  ]);

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  const name = await screen.findByRole("textbox", { name: "Название лида" });
  await user.type(name, "!");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });

  expect(await screen.findByText(/Другой пользователь уже изменил карточку/)).toBeVisible();
  expect(name).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Загрузить актуальную карточку" }));
  await waitFor(() => expect(name).toHaveValue("Новое название от коллеги"));
  expect(name).toBeEnabled();
});

it("сохраняет изменённый лид перед переходом по внутренней ссылке", async () => {
  setAccessToken("токен");
  const saved = {
    ...LEAD,
    name: "ООО Ромашка!",
    updated_at: "2026-10-01T11:00:00+03:00",
  };
  server = startFakeApi([...routes(), { method: "PATCH", path: "/crm/leads/10", response: saved }]);

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
        <Route path="/crm" element={<p>Доска CRM</p>} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  const name = await screen.findByRole("textbox", { name: "Название лида" });
  await user.type(name, "!");
  await user.click(screen.getByRole("link", { name: "Лиды" }));

  expect(await screen.findByRole("dialog", { name: "Несохранённые изменения" })).toBeVisible();
  expect(screen.queryByText("Доска CRM")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Сохранить и перейти" }));

  expect(await screen.findByText("Доска CRM")).toBeVisible();
  const patch = server.calls.find((call) => call.method === "PATCH");
  expect(patch?.body).toMatchObject({ name: "ООО Ромашка!", expected_updated_at: LEAD.updated_at });
});

it("даёт остаться на форме или уйти без сохранения", async () => {
  setAccessToken("токен");
  server = startFakeApi(routes());

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
        <Route path="/crm" element={<p>Доска CRM</p>} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );

  const name = await screen.findByRole("textbox", { name: "Название лида" });
  await user.type(name, "!");
  const link = screen.getByRole("link", { name: "Лиды" });
  await user.click(link);
  await screen.findByRole("dialog", { name: "Несохранённые изменения" });
  await user.click(screen.getByRole("button", { name: "Остаться" }));

  expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).not.toBeInTheDocument();
  expect(name).toHaveValue(`${LEAD.name}!`);
  await user.click(link);
  await screen.findByRole("dialog", { name: "Несохранённые изменения" });
  await user.click(screen.getByRole("button", { name: "Уйти без сохранения" }));

  expect(await screen.findByText("Доска CRM")).toBeVisible();
  expect(server.calls.some((call) => call.method === "PATCH")).toBe(false);
});
