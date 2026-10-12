/**
 * Автосохранение карточки заявки.
 *
 * Заявка сохраняется сама через три секунды простоя после последней правки;
 * кнопка «Сохранить» в шапке остаётся для нетерпеливых. После неудачной
 * попытки автосохранение выключается (иначе браузер повторял бы неудачный
 * запрос каждые три секунды, пока открыта вкладка) и включается снова, как
 * только человек что-то поправил. Новую, ещё не созданную заявку автосохранение
 * не трогает — её создаёт только явное нажатие.
 *
 * Тесты описывают фактическое поведение формы: сеть подменяется
 * (`startFakeApi`), время — поддельные таймеры, как в тестах карточки лида.
 */
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ShipmentFormPage } from "./ShipmentFormPage";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { page, startFakeApi, type FakeServer } from "@/test/fake-api";
import { ToastProvider } from "@/shared/ui/toast";
import { renderWithDataRouter } from "@/test/utils";

const ME = {
  id: 1,
  email: "manager@crmdetroid.ru",
  first_name: "Мария",
  last_name: "Петрова",
  role: "manager" as const,
  is_active: true,
};

const LEAD = {
  id: 10,
  name: "ООО «Ромашка»",
  inn: "7701234567",
  logist_contact: "",
  logist_phone: "",
  logist_email: null,
  accountant_name: null,
  priority: 0,
  is_archived: false,
  loss_reason_id: null,
  loss_reason_name: null,
  stage_id: 1,
  stage_name: "Новый",
  assigned_to_id: 1,
  assigned_to_email: "manager@crmdetroid.ru",
  assigned_to_name: "Мария Петрова",
  tags: [],
  created_at: "2026-01-10T09:00:00+00:00",
  updated_at: "2026-01-10T09:00:00+00:00",
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
  address_loading: "",
  address_unloading: "",
  contact_loading_name: "",
  contact_loading_phone: "",
  contact_unloading_name: "",
  contact_unloading_phone: "",
  cargo_weight: null,
  cargo_volume: null,
  comment: "",
  customer_price: null,
  customer_tax: "vat_22",
  carrier_price: null,
  carrier_tax: "vat_22",
  customer_address: "",
  customer_contact: "",
  customer_signer: "",
  loading_cities: [],
  loading_date_from: null,
  loading_date_to: null,
  loading_time_from: "",
  loading_time_to: "",
  unloading_cities: [],
  unloading_date_from: null,
  unloading_date_to: null,
  unloading_time_from: "",
  unloading_time_to: "",
  carrier_name: "",
  carrier_inn: "",
  carrier_contact: "",
  vehicle: "",
  vehicle_number: "",
  has_trailer: false,
  trailer_number: "",
  driver_name: "",
  driver_phone: "",
  driver_passport: "",
  carrier_signer: "",
  cargo_type: "",
  cargo_packaging: "",
  capacity: null,
  body_type: [],
  loading_method: [],
  tags: [],
  created_at: "2026-01-15T09:30:00+00:00",
};

/** Общие адреса карточки заявки; сохранение добавляется отдельно. */
function commonRoutes() {
  return [
    { path: "/auth/me", response: ME },
    { path: "/meta", response: { margin_deduction_rate: "0.25" } },
    { path: "/shipments/101/attachments", response: [] },
    { path: "/shipments/101/timeline", response: [] },
    { path: "/shipments/101", response: SHIPMENT },
    { path: "/crm/leads", response: page([]) },
    { path: "/crm/leads/10", response: LEAD },
    { path: "/crm/tags", response: [] },
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

/**
 * Настоящий сервер отвечает не мгновенно, и это здесь важно: пока запрос
 * в пути, форма успевает отрисоваться в состоянии «идёт сохранение», а после
 * ответа эффект автосохранения перезапускается. Именно на этом перезапуске
 * держится защита от повторов после ошибки: с мгновенным ответом React
 * склеивает оба состояния в одну отрисовку, эффект не перезапускается вовсе —
 * и тест «после ошибки повторов нет» проходит даже со сломанной защитой
 * (проверено подстановкой ошибки в код формы).
 */
function slowResponses(ms = 400) {
  const fakeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return fakeFetch(input, init);
  });
}

/** Сколько раз уходило сохранение существующей заявки. */
function saves(): number {
  return (server?.calls ?? []).filter(
    (c) => c.method === "PATCH" && c.url.includes("/shipments/101"),
  ).length;
}

/** Сколько раз уходило создание новой заявки. */
function creates(): number {
  return (server?.calls ?? []).filter((c) => c.method === "POST" && c.url.endsWith("/shipments"))
    .length;
}

/** Тело последнего сохранения — что именно отправили на сервер. */
function lastSaveBody(): Record<string, unknown> {
  const call = [...(server?.calls ?? [])]
    .reverse()
    .find((c) => c.method === "PATCH" && c.url.includes("/shipments/101"));
  return (call?.body ?? {}) as Record<string, unknown>;
}

function renderShipment(route = "/shipments/101") {
  return renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/shipments/:id" element={<ShipmentFormPage />} />
        <Route path="/shipments" element={<p>Список заявок</p>} />
      </Routes>
    </ToastProvider>,
    { route },
  );
}

/** Заявка отвечает успехом и возвращает то, что прислали. */
function saveRoute() {
  return {
    method: "PATCH",
    path: "/shipments/101",
    response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
  };
}

it("сохраняет правку сама через три секунды простоя и показывает «Сохранено»", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), saveRoute()]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  const address = await screen.findByLabelText("Адрес погрузки");
  await user.type(address, "Склад на Севере");

  // Пока правка свежая, запросов нет.
  expect(saves()).toBe(0);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });

  await waitFor(() => expect(saves()).toBe(1));
  expect(lastSaveBody().address_loading).toBe("Склад на Севере");
  expect(lastSaveBody().number).toBe("101");

  // Подтверждение для человека и снятая пометка «не сохранено».
  expect(await screen.findByText("Сохранено")).toBeVisible();
  expect(screen.queryByLabelText("Несохранённые изменения")).not.toBeInTheDocument();
});

it("простой без правок не вызывает запросов, а после сохранения повторов нет", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), saveRoute()]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  // Открытие карточки — не правка: сколько бы ни ждали, сохранять нечего.
  await screen.findByLabelText("Адрес погрузки");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(saves()).toBe(0);

  await user.type(screen.getByLabelText("Адрес погрузки"), "Склад");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(saves()).toBe(1));

  // Уже сохранено — второй раз тот же запрос не уходит.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20000);
  });
  expect(saves()).toBe(1);
});

it("ждёт три секунды после последней правки, а не после первой", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), saveRoute()]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  const address = await screen.findByLabelText("Адрес погрузки");
  await user.type(address, "Склад");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(saves()).toBe(0);

  // Правка продолжается — отсчёт начинается заново.
  await user.type(address, " №5");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(saves()).toBe(0);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
  await waitFor(() => expect(saves()).toBe(1));
  expect(lastSaveBody().address_loading).toBe("Склад №5");
});

it("ручное сохранение до истечения таймера не даёт второго запроса", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), saveRoute()]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  await user.type(await screen.findByLabelText("Адрес погрузки"), "Склад");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(saves()).toBe(1));

  // Таймер автосохранения после ручного нажатия больше не срабатывает.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(saves()).toBe(1);
});

it("новую заявку автосохранение не создаёт — её создаёт только кнопка", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    { method: "POST", path: "/shipments", response: { ...SHIPMENT, id: 555, number: "555" } },
    { path: "/shipments/555/attachments", response: [] },
    { path: "/shipments/555/timeline", response: [] },
  ]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment("/shipments/new?lead=10");

  await user.type(await screen.findByLabelText("Адрес погрузки"), "Склад на Севере");

  // Десять секунд простоя: автосохранение новую заявку не трогает.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(creates()).toBe(0);

  await user.click(screen.getByRole("button", { name: "Сохранить" }));
  await waitFor(() => expect(creates()).toBe(1));
});

it("после ошибки автосохранение выключается: запрос не повторяется бесконечно", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      status: 500,
      response: { detail: "Сервер недоступен" },
    },
  ]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  await user.type(await screen.findByLabelText("Адрес погрузки"), "Склад");

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(saves()).toBe(1));

  // Человек видит причину, а браузер не долбит сервер каждые три секунды.
  expect(await screen.findByRole("alert")).toHaveTextContent("Сервер недоступен");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30000);
  });
  expect(saves()).toBe(1);
});

it("правка руками после ошибки снова включает автосохранение", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      status: 500,
      response: { detail: "Сервер недоступен" },
    },
  ]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  const address = await screen.findByLabelText("Адрес погрузки");
  await user.type(address, "Склад");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(saves()).toBe(1));

  // Прошлая попытка могла упасть именно из-за того, что сейчас исправляют.
  await user.type(address, " №5");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  await waitFor(() => expect(saves()).toBe(2));
  expect(lastSaveBody().address_loading).toBe("Склад №5");
});

it("уход со страницы: спрашивает, «Сохранить и перейти» шлёт один запрос", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), saveRoute()]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  await user.type(await screen.findByLabelText("Адрес погрузки"), "Склад");
  await user.click(screen.getByRole("link", { name: "Заявки" }));

  expect(await screen.findByRole("dialog", { name: "Несохранённые изменения" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Сохранить и перейти" }));

  await waitFor(() => expect(saves()).toBe(1));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(saves()).toBe(1);
  expect(await screen.findByText("Список заявок")).toBeVisible();
});

it("если автосохранение успело пройти в открытом диалоге, переход продолжается сам — без второго запроса", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), saveRoute()]);
  slowResponses();

  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderShipment();

  await user.type(await screen.findByLabelText("Адрес погрузки"), "Склад");
  await user.click(screen.getByRole("link", { name: "Заявки" }));
  expect(await screen.findByRole("dialog", { name: "Несохранённые изменения" })).toBeVisible();

  // Диалог открыт, но таймер автосохранения продолжает идти: вопрос «сохранять
  // или нет» снимается сам собой, и переход выполняется ровно один раз.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });

  await waitFor(() => expect(saves()).toBe(1));
  expect(await screen.findByText("Список заявок")).toBeVisible();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(10000);
  });
  expect(saves()).toBe(1);
});
