/**
 * Форма заявки на уровне страницы: дата создания (заявку часто заводят
 * в CRM позже, чем она реально возникла, и нужно уметь исправить её задним
 * числом), маржа по серверной ставке, защита несохранённых правок
 * и проводка полей блоков «Информация о грузе», «Информация о выгрузке»,
 * «Информация о погрузке», «Сведения о перевозчике» и шапки «Заявка»
 * до сохранения. Шапка проверяется «сквозным» путём: выбор лида, поиск лида
 * и подстановка лида по ссылке `?lead=` — с настоящими запросами и проверкой,
 * что лишнего на сервер не уходит.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

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

let server: FakeServer | undefined;
afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

function commonRoutes() {
  return [
    { path: "/auth/me", response: ME },
    { path: "/meta", response: { margin_deduction_rate: "0.25" } },
    { path: "/shipments/101/attachments", response: [] },
    { path: "/shipments/101/timeline", response: [] },
    { path: "/shipments/101", response: SHIPMENT },
    { path: "/crm/leads", response: page([]) },
    { path: "/crm/tags", response: [] },
  ];
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

it("дата создания заполняется из карточки заявки", async () => {
  setAccessToken("токен");
  server = startFakeApi(commonRoutes());

  renderShipment();

  const input = (await screen.findByLabelText("Дата создания")) as HTMLInputElement;
  // В часовом поясе теста (UTC) совпадает буквально; важно само наличие
  // значения — поле не должно оставаться пустым у уже сохранённой заявки.
  await waitFor(() => expect(input.value).toBe("2026-01-15T09:30"));
});

it("изменённая дата создания уходит на сервер при сохранении", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => {
        const updates = body as { created_at?: string };
        return {
          ...SHIPMENT,
          ...updates,
          created_at: updates.created_at
            ? new Date(updates.created_at).toISOString()
            : SHIPMENT.created_at,
        };
      },
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  const input = (await screen.findByLabelText("Дата создания")) as HTMLInputElement;
  await waitFor(() => expect(input.value).toBe("2026-01-15T09:30"));

  await user.clear(input);
  await user.type(input, "2025-12-01T00:00");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/shipments/101")).toBe(true));
  const patch = server.calls.find((c) => c.method === "PATCH" && c.url.includes("/shipments/101"));
  expect((patch?.body as { created_at?: string })?.created_at).toBe(
    new Date("2025-12-01T00:00").toISOString(),
  );
});

it("маржа на вкладке «Позиции заказа» считается по ставке с сервера (Т-08)", async () => {
  setAccessToken("токен");
  // Ставку вычета форма знает только из ответа /meta — локальной копии нет.
  server = startFakeApi(commonRoutes());

  const user = userEvent.setup();
  renderShipment();

  await user.click(await screen.findByRole("button", { name: "Позиции заказа" }));
  await user.type(await screen.findByLabelText("Цена для заказчика"), "122000");
  // У перевозчика НДС нет: «Без НДС» выбираем во втором налоговом списке
  // (первый — у заказчика; на странице есть и другие выпадающие списки).
  const noVatOptions = screen.getAllByRole("option", { name: "Без НДС" });
  const carrierTaxSelect = noVatOptions[1].closest("select");
  expect(carrierTaxSelect).not.toBeNull();
  await user.selectOptions(carrierTaxSelect!, "no_vat");
  await user.type(await screen.findByLabelText("Цена для перевозчика"), "80000");

  // 122 000 с НДС 22% — это 100 000 без НДС; (100 000 − 80 000) × 0,75 = 15 000.
  // ru-RU группирует разряды неразрывным пробелом (U+00A0) — сравниваем сами.
  await screen.findByText(
    (_content, element) =>
      element?.tagName === "SPAN" && element.textContent?.replace(/\u00A0/g, " ") === "15 000,00",
  );
});

it("сохраняет изменённую заявку перед переходом по внутренней ссылке", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  const createdAt = (await screen.findByLabelText("Дата создания")) as HTMLInputElement;
  await waitFor(() => expect(createdAt.value).toBe("2026-01-15T09:30"));
  await user.clear(createdAt);
  await user.type(createdAt, "2025-12-01T00:00");
  await user.click(screen.getByRole("link", { name: "Заявки" }));

  expect(await screen.findByRole("dialog", { name: "Несохранённые изменения" })).toBeVisible();
  expect(screen.queryByText("Список заявок")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Сохранить и перейти" }));

  expect(await screen.findByText("Список заявок")).toBeVisible();
  expect(server.called("PATCH", "/shipments/101")).toBe(true);
});

it("защищает даже новую заявку без выбранного лида", async () => {
  setAccessToken("токен");
  server = startFakeApi(commonRoutes());

  const user = userEvent.setup();
  renderShipment("/shipments/new");

  await user.type(await screen.findByLabelText("Адрес погрузки"), "Склад на Севере");
  await user.click(screen.getByRole("link", { name: "Заявки" }));

  expect(await screen.findByRole("dialog", { name: "Несохранённые изменения" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Сохранить и перейти" })).toBeDisabled();
});

it("правки блока «Информация о грузе» уходят на сервер теми же полями", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  // Заполняем все восемь полей блока — значения нарочно разные, чтобы
  // перепутанные местами обработчики было видно сразу.
  await user.type(await screen.findByLabelText("Тип груза"), "Химгрузы");
  await user.type(screen.getByLabelText("Упаковка"), "Биг-бэги");
  await user.type(screen.getByLabelText("Объём кузова, м³"), "92,5");
  await user.type(screen.getByLabelText("Вес груза, т"), "21");
  await user.type(screen.getByLabelText("Грузоподъёмность, т"), "22");
  await user.type(screen.getByLabelText("Тип кузова"), "изотерм{Enter}");
  await user.type(screen.getByLabelText("Способ погрузки"), "боковая{Enter}");
  await user.selectOptions(screen.getByLabelText("Тип транспорта"), "ref");

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/shipments/101")).toBe(true));
  const patch = server.calls.find((c) => c.method === "PATCH" && c.url.includes("/shipments/101"));
  expect(patch?.body).toMatchObject({
    cargo_type: "Химгрузы",
    cargo_packaging: "Биг-бэги",
    cargo_volume: "92,5",
    cargo_weight: "21",
    capacity: "22",
    body_type: ["изотерм"],
    loading_method: ["боковая"],
    transport_type: "ref",
  });
});

it("правки блока «Информация о выгрузке» уходят на сервер теми же полями", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  // Шесть полей блока: значения нарочно разные, чтобы перепутанные местами
  // обработчики было видно сразу.
  await user.type(await screen.findByLabelText("Города выгрузки"), "Казань{Enter}");
  await user.type(screen.getByLabelText("Адрес выгрузки"), "Склад №2");
  await user.type(
    screen.getByLabelText("Контактное лицо на выгрузке и телефон"),
    "Петров Пётр, +7 900 111-22-33",
  );
  // Даты и время берём по id: подпись «Время» есть и у погрузки, и у выгрузки.
  fireEvent.change(document.getElementById("ship-unload-date-from")!, {
    target: { value: "2026-02-10" },
  });
  fireEvent.change(document.getElementById("ship-unload-date-to")!, {
    target: { value: "2026-02-11" },
  });
  await user.type(document.getElementById("ship-unload-time-from")!, "14:00");

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/shipments/101")).toBe(true));
  const patch = server.calls.find((c) => c.method === "PATCH" && c.url.includes("/shipments/101"));
  expect(patch?.body).toMatchObject({
    unloading_cities: ["Казань"],
    address_unloading: "Склад №2",
    contact_unloading_name: "Петров Пётр, +7 900 111-22-33",
    unloading_date_from: "2026-02-10",
    unloading_date_to: "2026-02-11",
    unloading_time_from: "14:00",
  });
});

it("правки блока «Информация о погрузке» уходят на сервер теми же полями", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  // Шесть полей блока: значения нарочно разные, чтобы перепутанные местами
  // обработчики было видно сразу.
  await user.type(await screen.findByLabelText("Города погрузки"), "Тверь{Enter}");
  await user.type(screen.getByLabelText("Адрес погрузки"), "Склад №7");
  await user.type(
    screen.getByLabelText("Контактное лицо на погрузке и телефон"),
    "Сидоров Сидор, +7 900 222-33-44",
  );
  // Даты и время берём по id: подпись «Время» есть и у погрузки, и у выгрузки.
  fireEvent.change(document.getElementById("ship-load-date-from")!, {
    target: { value: "2026-03-01" },
  });
  fireEvent.change(document.getElementById("ship-load-date-to")!, {
    target: { value: "2026-03-02" },
  });
  await user.type(document.getElementById("ship-load-time-from")!, "07:45");

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/shipments/101")).toBe(true));
  const patch = server.calls.find((c) => c.method === "PATCH" && c.url.includes("/shipments/101"));
  expect(patch?.body).toMatchObject({
    loading_cities: ["Тверь"],
    address_loading: "Склад №7",
    contact_loading_name: "Сидоров Сидор, +7 900 222-33-44",
    loading_date_from: "2026-03-01",
    loading_date_to: "2026-03-02",
    loading_time_from: "07:45",
  });
});

it("правки блока «Сведения о перевозчике» уходят на сервер теми же полями", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  // Значения вписываем целиком (клик и вставка): по буквам контролируемое поле
  // зовёт обработчик на каждый символ, а нам важны итоговые поля запроса.
  const fill = async (label: string, value: string) => {
    const input = screen.getByLabelText(label);
    await user.click(input);
    await user.paste(value);
  };

  // «Номер прицепа» — единственное условное поле блока: без галочки его нет.
  // Сначала дожидаемся самой формы (иначе проверка на отсутствие поля была бы
  // пустой: пока данные грузятся, на экране ничего нет).
  const trailerCheckbox = await screen.findByRole("checkbox", { name: "Есть прицеп" });
  expect(screen.queryByLabelText("Номер прицепа")).toBeNull();
  await user.click(trailerCheckbox);
  expect(screen.getByLabelText("Номер прицепа")).toBeVisible();

  await fill("Перевозчик", "ООО Транс");
  await fill("ИНН перевозчика", "7701234567");
  await fill("Контакт перевозчика", "Иванов, +7 900 000-00-00");
  await fill("ТС (марка)", "Volvo FH");
  await fill("Номер ТС", "А123ВС77");
  await fill("Номер прицепа", "ЕК4567");
  await fill("ФИО водителя", "Сидоров Сидор");
  await fill("Телефон водителя", "+7 900 111-22-33");
  await fill("Паспорт водителя", "4509 123456");
  await fill("Кто подписывает", "Директор Петров");

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/shipments/101")).toBe(true));
  // Берём последний запрос: до нажатия «Сохранить» могло сработать
  // автосохранение с частью полей.
  const patches = server.calls.filter(
    (c) => c.method === "PATCH" && c.url.includes("/shipments/101"),
  );
  expect(patches[patches.length - 1]?.body).toMatchObject({
    carrier_name: "ООО Транс",
    carrier_inn: "7701234567",
    carrier_contact: "Иванов, +7 900 000-00-00",
    vehicle: "Volvo FH",
    vehicle_number: "А123ВС77",
    has_trailer: true,
    trailer_number: "ЕК4567",
    driver_name: "Сидоров Сидор",
    driver_phone: "+7 900 111-22-33",
    driver_passport: "4509 123456",
    carrier_signer: "Директор Петров",
  });
});

const LEAD_LUTIK = {
  id: 42,
  name: "ООО «Лютик»",
  inn: "7712345678",
  logist_contact: "Иван",
  logist_phone: "+7 900 000-00-00",
  logist_email: null,
  accountant_name: null,
  priority: 0,
  is_archived: false,
  loss_reason_id: null,
  loss_reason_name: null,
  stage_id: 1,
  stage_name: "Новый",
  assigned_to_id: null,
  assigned_to_email: null,
  assigned_to_name: null,
  tags: [],
  created_at: "2026-01-01T00:00:00+00:00",
  updated_at: "2026-01-01T00:00:00+00:00",
};

const LEAD_PETROV = { ...LEAD_LUTIK, id: 43, name: "ИП Петров", inn: "500100732259" };

/** Запросы не-GET: сохранение, смена этапа и прочие изменения. */
function writeCalls() {
  return server?.calls.filter((call) => call.method !== "GET") ?? [];
}

it("выбор лида уходит в новую заявку тем же полем", async () => {
  setAccessToken("токен");
  // Адреса для конкретных лидов — раньше общего списка: поддельный сервер
  // подбирает маршрут по началу адреса.
  server = startFakeApi([
    { path: "/crm/leads/43", response: LEAD_PETROV },
    { path: "/crm/leads/42", response: LEAD_LUTIK },
    { path: "/crm/leads", response: page([LEAD_LUTIK, LEAD_PETROV]) },
    {
      method: "POST",
      path: "/shipments",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
    ...commonRoutes(),
  ]);

  const user = userEvent.setup();
  renderShipment("/shipments/new");

  const select = (await screen.findByLabelText("Лид")) as HTMLSelectElement;
  // Список лидов приходит запросом: ждём, пока в списке появятся оба.
  await waitFor(() => expect(select.options.length).toBe(3));
  await user.selectOptions(select, "42");
  expect(select.value).toBe("42");

  // Новую заявку создаёт человек: до нажатия «Сохранить» ничего не уходит.
  expect(writeCalls()).toEqual([]);

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("POST", "/shipments")).toBe(true));
  const post = writeCalls()[0];
  expect(post?.body).toMatchObject({ lead_id: 42 });
});

it("поиск лида идёт на сервер и не делает новую заявку несохранённой", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    { path: "/crm/leads", query: { search: "лютик" }, response: page([LEAD_LUTIK]) },
    { path: "/crm/leads", response: page([LEAD_LUTIK, LEAD_PETROV]) },
    ...commonRoutes(),
  ]);

  const user = userEvent.setup();
  renderShipment("/shipments/new");

  const search = await screen.findByLabelText("Поиск лида");
  await user.click(search);
  await user.paste("лютик");

  // Список запрашивается заново с текстом поиска, и на экране остаётся один лид.
  await waitFor(() =>
    expect(
      server?.calls.some((call) => decodeURIComponent(call.url).includes("search=лютик")),
    ).toBe(true),
  );
  const select = (await screen.findByLabelText("Лид")) as HTMLSelectElement;
  await waitFor(() =>
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Выберите лид",
      "ООО «Лютик» · 7712345678",
    ]),
  );

  // Заявку поиск не меняет: ни запросов на сохранение, ни «несохранённых правок».
  expect(writeCalls()).toEqual([]);
  expect(screen.queryByLabelText("Несохранённые изменения")).toBeNull();
  expect(screen.queryByRole("button", { name: "Сохранить" })).toBeNull();

  // И уход со страницы не спрашивает про несохранённые изменения.
  await user.click(screen.getByRole("link", { name: "Заявки" }));
  expect(await screen.findByText("Список заявок")).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).toBeNull();
});

it("ссылка ?lead=42 подставляет лида и не делает форму несохранённой", async () => {
  setAccessToken("токен");
  server = startFakeApi([{ path: "/crm/leads/42", response: LEAD_LUTIK }, ...commonRoutes()]);

  const user = userEvent.setup();
  renderShipment("/shipments/new?lead=42");

  // Лид подставлен выбранным — отдельным пунктом, потому что в списке его нет.
  const select = (await screen.findByLabelText("Лид")) as HTMLSelectElement;
  await waitFor(() => expect(select.value).toBe("42"));
  await waitFor(() =>
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Выберите лид",
      "ООО «Лютик» · 7712345678",
    ]),
  );

  // Форма не «грязная»: уход без вопросов и без запросов сохранения.
  await user.click(screen.getByRole("link", { name: "Заявки" }));
  expect(await screen.findByText("Список заявок")).toBeVisible();
  expect(screen.queryByRole("dialog", { name: "Несохранённые изменения" })).toBeNull();
  expect(writeCalls()).toEqual([]);
});

it("новая заявка без лида не уходит на сервер и объясняет, чего не хватает", async () => {
  setAccessToken("токен");
  server = startFakeApi(commonRoutes());

  const user = userEvent.setup();
  renderShipment("/shipments/new");

  // Правка поля шапки делает форму несохранённой — в хедере появляется «Сохранить».
  const contact = await screen.findByLabelText("Контакт заказчика");
  await user.click(contact);
  await user.paste("Мария");

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Выберите лид, по которому создаётся заявка")).toBeVisible();
  expect(writeCalls()).toEqual([]);
});

it("номер заявки уходит на сервер без лишних пробелов", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      method: "PATCH",
      path: "/shipments/101",
      response: (body: unknown) => ({ ...SHIPMENT, ...(body as object) }),
    },
  ]);

  const user = userEvent.setup();
  renderShipment();

  const number = (await screen.findByLabelText("Номер заявки")) as HTMLInputElement;
  await waitFor(() => expect(number.value).toBe("101"));

  await user.clear(number);
  await user.click(number);
  await user.paste("  777  ");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(server?.called("PATCH", "/shipments/101")).toBe(true));
  // Берём последний запрос: до кнопки могло успеть сработать автосохранение.
  const patches = server.calls.filter((call) => call.method === "PATCH");
  expect((patches[patches.length - 1]?.body as { number?: string })?.number).toBe("777");
});

it("пустой номер у существующей заявки не уходит на сервер", async () => {
  setAccessToken("токен");
  // Маршрута сохранения нет вовсе: любой ушедший запрос сразу виден в журнале.
  server = startFakeApi(commonRoutes());

  const user = userEvent.setup();
  renderShipment();

  const number = (await screen.findByLabelText("Номер заявки")) as HTMLInputElement;
  await waitFor(() => expect(number.value).toBe("101"));

  await user.clear(number);
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Номер заявки не может быть пустым")).toBeVisible();
  expect(writeCalls()).toEqual([]);
});
