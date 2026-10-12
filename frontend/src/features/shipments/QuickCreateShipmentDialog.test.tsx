/**
 * Быстрое создание заявки карточки лида: обязательные поля, что уходит
 * на сервер, ожидание ответа и переход на созданную заявку.
 *
 * До этих тестов окно открывалось в сквозных сценариях карточки, но ни одна
 * кнопка и ни одно поле внутри него не нажимались. Правила взяты из самого
 * компонента и не менялись: обязательны хотя бы один город погрузки и выгрузки,
 * обе даты и непустое название перевозчика (пробелы не считаются); ИНН
 * и контакт перевозчика необязательны и уходят пустыми строками.
 *
 * Даты ставятся через `fireEvent.change`: у полей типа `date` набор текстом
 * не работает, значение задаётся напрямую.
 *
 * Даты и название перевозчика помечены `required`, поэтому при пустой форме
 * отправку останавливает браузер, а не общая проверка компонента: сообщение
 * «Заполните все поля» видно тогда, когда браузерная проверка пройдена
 * (не хватает городов или перевозчик состоит из одних пробелов).
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useParams } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickCreateShipmentDialog } from "./QuickCreateShipmentDialog";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithDataRouter } from "@/test/utils";

/**
 * Ответ сервера на создание — полный набор полей, который требует схема
 * ответа заявки (shipmentSchema); так же сделано в тестах формы заявки.
 */
const CREATED = {
  id: 77,
  number: "77",
  lead_id: 55,
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
  loading_cities: ["Москва"],
  loading_date_from: "2026-10-05",
  loading_date_to: null,
  loading_time_from: "",
  loading_time_to: "",
  unloading_cities: ["Казань"],
  unloading_date_from: "2026-10-07",
  unloading_date_to: null,
  unloading_time_from: "",
  unloading_time_to: "",
  carrier_name: "ООО «Перевозчик»",
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
  created_at: "2026-10-05T09:30:00+00:00",
};

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

/** Заявки, ушедшие на сервер: тело проверяем по последней. */
function calls(method: string, path: string) {
  return (server?.calls ?? []).filter(
    (call) => call.method === method && call.url.startsWith(`/api/v1${path}`),
  );
}

function body(method: string, path: string): Record<string, unknown> {
  return (calls(method, path)[calls(method, path).length - 1]?.body ?? {}) as Record<
    string,
    unknown
  >;
}

/** Заглушка карточки заявки: по ней видно, что переход состоялся. */
function ShipmentStub() {
  const { id } = useParams();
  return <p>Карточка заявки {id}</p>;
}

function renderDialog({
  leadId = 10,
  onClose = vi.fn(),
}: { leadId?: number; onClose?: () => void } = {}) {
  return renderWithDataRouter(
    <Routes>
      <Route path="/shipments/:id" element={<ShipmentStub />} />
      <Route path="*" element={<QuickCreateShipmentDialog leadId={leadId} onClose={onClose} />} />
    </Routes>,
    { route: "/crm/leads/10" },
  );
}

type Field = "loading-cities" | "unloading-cities" | "loading-date" | "unloading-date" | "carrier";

/**
 * Заполняет форму, пропуская указанное поле: так видно, какое именно правило
 * обязательности сработало, — все остальные поля на месте.
 */
async function fillForm(user: ReturnType<typeof userEvent.setup>, skip?: Field) {
  if (skip !== "loading-cities") {
    await user.type(screen.getByLabelText("Города погрузки"), "Москва{Enter}");
  }
  if (skip !== "unloading-cities") {
    await user.type(screen.getByLabelText("Города выгрузки"), "Казань{Enter}");
  }
  if (skip !== "loading-date") {
    fireEvent.change(screen.getByLabelText("Дата погрузки"), { target: { value: "2026-10-05" } });
  }
  if (skip !== "unloading-date") {
    fireEvent.change(screen.getByLabelText("Дата выгрузки"), { target: { value: "2026-10-07" } });
  }
  if (skip !== "carrier") {
    await user.type(screen.getByLabelText("Перевозчик"), "ООО «Перевозчик»");
  }
}

function submitButton() {
  return screen.getByRole("button", { name: "Создать" });
}

/** Сама форма: нужна, чтобы отправить её в обход браузерной проверки. */
function formElement(): HTMLFormElement {
  const form = screen.getByRole("dialog", { name: "Новая заявка" }).querySelector("form");
  if (!form) throw new Error("форма быстрого создания заявки не найдена");
  return form;
}

const REQUIRED_MESSAGE = "Заполните все поля — они обязательны";

/**
 * Настоящий сервер отвечает не мгновенно: пока запрос в пути, видны состояния
 * ожидания. Так же сделано в тестах автосохранения заявки.
 */
function slowResponses(ms = 300) {
  const fakeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return fakeFetch(input, init);
  });
}

describe("Быстрое создание заявки", () => {
  it("пустая форма не уходит на сервер: отправку останавливают обязательные поля", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    const { router } = renderDialog();

    expect(screen.getByRole("dialog", { name: "Новая заявка" })).toBeVisible();
    await user.click(submitButton());

    // Даты и название перевозчика помечены `required`: браузер не даёт
    // отправить форму и подсвечивает незаполненные поля — до собственной
    // проверки компонента дело не доходит.
    expect(screen.getByLabelText("Дата погрузки")).toBeInvalid();
    expect(screen.getByLabelText("Дата выгрузки")).toBeInvalid();
    expect(screen.getByLabelText("Перевозчик")).toBeInvalid();
    expect(calls("POST", "/shipments")).toHaveLength(0);
    expect(router.state.location.pathname).toBe("/crm/leads/10");
    // Окно не закрылось: человеку есть что исправить и отправить снова.
    expect(screen.getByRole("dialog", { name: "Новая заявка" })).toBeVisible();
  });

  it("без города погрузки запрос не уходит", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "loading-cities");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/shipments")).toHaveLength(0);
  });

  it("без города выгрузки запрос не уходит", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "unloading-cities");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/shipments")).toHaveLength(0);
  });

  it("без даты погрузки запрос не уходит", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "loading-date");
    await user.click(submitButton());

    // Дата обязательна и помечена `required`: браузер останавливает отправку.
    expect(screen.getByLabelText("Дата погрузки")).toBeInvalid();
    expect(calls("POST", "/shipments")).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Новая заявка" })).toBeVisible();
  });

  it("без даты выгрузки запрос не уходит", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "unloading-date");
    await user.click(submitButton());

    // Дата обязательна и помечена `required`: браузер останавливает отправку.
    expect(screen.getByLabelText("Дата выгрузки")).toBeInvalid();
    expect(calls("POST", "/shipments")).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Новая заявка" })).toBeVisible();
  });

  it("собственная проверка формы ловит пустые даты, когда браузерная не сработала", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText("Города погрузки"), "Москва{Enter}");
    await user.type(screen.getByLabelText("Города выгрузки"), "Казань{Enter}");
    fireEvent.change(screen.getByLabelText("Дата выгрузки"), { target: { value: "2026-10-07" } });
    await user.type(screen.getByLabelText("Перевозчик"), "ООО «Перевозчик»");

    // Отправляем форму напрямую: браузерная проверка обязательных полей
    // пропускается, и видно собственную защиту компонента — на случай, если
    // пометка `required` когда-нибудь пропадёт.
    fireEvent.submit(formElement());
    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/shipments")).toHaveLength(0);

    // Теперь заполнена дата погрузки, но пуста дата выгрузки.
    fireEvent.change(screen.getByLabelText("Дата погрузки"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Дата выгрузки"), { target: { value: "" } });
    fireEvent.submit(formElement());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/shipments")).toHaveLength(0);
  });

  it("название перевозчика только из пробелов обязательное поле не закрывает", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "carrier");
    await user.type(screen.getByLabelText("Перевозчик"), "   ");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/shipments")).toHaveLength(0);
  });

  it("заполненная форма шлёт один запрос: поля обрезаны, номер лида из карточки", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog({ leadId: 55 });

    await user.type(screen.getByLabelText("Города погрузки"), "Москва{Enter}");
    await user.type(screen.getByLabelText("Города погрузки"), "Тверь{Enter}");
    await user.type(screen.getByLabelText("Города выгрузки"), "Казань{Enter}");
    fireEvent.change(screen.getByLabelText("Дата погрузки"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Дата выгрузки"), { target: { value: "2026-10-07" } });
    await user.type(screen.getByLabelText("Перевозчик"), "  ООО «Перевозчик»  ");
    await user.type(screen.getByLabelText("ИНН перевозчика"), " 7701234567 ");
    await user.type(screen.getByLabelText("Контакт перевозчика"), "  Иван  ");
    await user.click(submitButton());

    await waitFor(() => expect(calls("POST", "/shipments")).toHaveLength(1));
    // Точное сравнение: ни лишнего поля, ни пропущенного.
    expect(body("POST", "/shipments")).toEqual({
      lead_id: 55,
      carrier_name: "ООО «Перевозчик»",
      carrier_inn: "7701234567",
      carrier_contact: "Иван",
      loading_cities: ["Москва", "Тверь"],
      loading_date_from: "2026-10-05",
      unloading_cities: ["Казань"],
      unloading_date_from: "2026-10-07",
    });
  });

  it("необязательные поля перевозчика уходят пустыми строками", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    await waitFor(() => expect(calls("POST", "/shipments")).toHaveLength(1));
    expect(body("POST", "/shipments")).toMatchObject({ carrier_inn: "", carrier_contact: "" });
  });

  it("город можно убрать до отправки — в запрос уходит оставшийся", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    await user.type(screen.getByLabelText("Города погрузки"), "Тверь{Enter}");
    await user.click(screen.getByRole("button", { name: "Убрать Тверь" }));
    await user.click(submitButton());

    await waitFor(() => expect(calls("POST", "/shipments")).toHaveLength(1));
    expect(body("POST", "/shipments")).toMatchObject({ loading_cities: ["Москва"] });
  });

  it("после создания открывается карточка новой заявки", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    const { router } = renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByText("Карточка заявки 77")).toBeVisible();
    expect(router.state.location.pathname).toBe("/shipments/77");
    expect(calls("POST", "/shipments")).toHaveLength(1);
  });

  it("ошибка сервера остаётся в окне, адрес не меняется", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      {
        method: "POST",
        path: "/shipments",
        response: { detail: "Перевозчик заблокирован" },
        status: 422,
      },
    ]);

    const user = userEvent.setup();
    const { router } = renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Перевозчик заблокирован");
    expect(screen.getByRole("dialog", { name: "Новая заявка" })).toBeVisible();
    expect(router.state.location.pathname).toBe("/crm/leads/10");
    expect(calls("POST", "/shipments")).toHaveLength(1);
  });

  it("подсказка стирается, когда форму отправляют снова", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);

    const user = userEvent.setup();
    const { router } = renderDialog();

    // Первая попытка без городов: браузер пропускает такую отправку (города
    // не помечены `required`), и срабатывает проверка компонента.
    fireEvent.change(screen.getByLabelText("Дата погрузки"), { target: { value: "2026-10-05" } });
    fireEvent.change(screen.getByLabelText("Дата выгрузки"), { target: { value: "2026-10-07" } });
    await user.type(screen.getByLabelText("Перевозчик"), "ООО «Перевозчик»");
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);

    await user.type(screen.getByLabelText("Города погрузки"), "Москва{Enter}");
    await user.type(screen.getByLabelText("Города выгрузки"), "Казань{Enter}");
    slowResponses();
    await user.click(submitButton());

    // Пока запрос в пути, старой подсказки уже нет: отправка её стирает.
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Создаём…" })).toBeDisabled();

    expect(await screen.findByText("Карточка заявки 77")).toBeVisible();
    expect(router.state.location.pathname).toBe("/shipments/77");
    expect(calls("POST", "/shipments")).toHaveLength(1);
  });

  it("пока ждём сервер, кнопка говорит «Создаём…» и не принимает повторных нажатий", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);
    slowResponses();

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    const pending = screen.getByRole("button", { name: "Создаём…" });
    expect(pending).toBeDisabled();
    // Нажатие по заблокированной кнопке не отправляет второй запрос.
    fireEvent.click(pending);

    expect(await screen.findByText("Карточка заявки 77")).toBeVisible();
    await waitFor(() => expect(calls("POST", "/shipments")).toHaveLength(1));
  });

  it("при обрыве связи показывается понятное сообщение", async () => {
    setAccessToken("токен");
    server = startFakeApi([{ method: "POST", path: "/shipments", response: CREATED }]);
    // Сеть недоступна: запрос падает до ответа сервера — окно должно сказать
    // «Не удалось создать заявку», а не остаться молчаливым.
    vi.stubGlobal("fetch", () => Promise.reject(new TypeError("Failed to fetch")));

    const user = userEvent.setup();
    const { router } = renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось создать заявку");
    expect(router.state.location.pathname).toBe("/crm/leads/10");
    expect(screen.getByRole("dialog", { name: "Новая заявка" })).toBeVisible();
  });

  it("«Отмена» закрывает окно", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onClose });

    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
