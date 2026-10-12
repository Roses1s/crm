/**
 * Быстрое создание лида: обязательные поля и предупреждение о дубле ИНН.
 *
 * Предупреждение не должно блокировать отправку — это проверяется отдельно
 * (кнопка «Создать» остаётся кликабельной, запрос на создание всё равно уходит).
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QuickCreateLeadDialog } from "./QuickCreateLeadDialog";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { Route, Routes, useParams } from "react-router-dom";

import { renderWithDataRouter, renderWithProviders } from "@/test/utils";

const STAGES = [{ id: 1, name: "Новый", sequence: 1, color: "" }];

const CREATED_LEAD = {
  id: 42,
  name: "ООО Вектор",
  inn: "7701234567",
  logist_contact: "Иванов",
  logist_phone: "+7 900 111-22-33",
  logist_email: null,
  accountant_name: null,
  priority: 0,
  is_archived: false,
  loss_reason_id: null,
  loss_reason_name: null,
  stage_id: 1,
  stage_name: "Новый",
  assigned_to_id: 1,
  assigned_to_email: "manager@example.test",
  assigned_to_name: "Мария",
  tags: [],
  created_at: "2026-10-01T10:00:00+03:00",
  updated_at: "2026-10-01T10:00:00+03:00",
};

// Два этапа: по номеру видно, что в запрос уходит ПЕРВЫЙ этап своей доски,
// а не любой другой из списка.
const TWO_STAGES = [
  { id: 7, name: "Первый", sequence: 1, color: "" },
  { id: 8, name: "Второй", sequence: 2, color: "" },
];

/** Совпадение по ИНН: чужой активный лид приходит урезанным — без телефонов. */
const EXISTING_CUSTOMER = {
  id: 99,
  name: "ООО «Ромашка»",
  inn: "7701234567",
  assigned_to_id: 5,
  assigned_to_name: "Пётр Сидоров",
  is_archived: false,
  can_open: false,
  loss_reason_name: null,
  logist_contact: null,
  logist_phone: null,
  logist_email: null,
  priority: null,
  stage_name: null,
  tags: [],
  updated_at: "2026-10-01T10:00:00+03:00",
};

/** Совпадение по ИНН без ответственного: приписки про него быть не должно. */
const EXISTING_CUSTOMER_WITHOUT_OWNER = {
  ...EXISTING_CUSTOMER,
  assigned_to_id: null,
  assigned_to_name: null,
};

const REQUIRED_MESSAGE = "Заполните все поля — они обязательны";
const NO_STAGE_MESSAGE = "На вашей доске нет ни одного этапа — сначала создайте этап";
const INN_MESSAGE = "Проверьте ИНН: нужно 10 или 12 цифр с верной контрольной суммой";

/** Запросы, ушедшие на сервер. */
function calls(method: string, path: string) {
  return (server?.calls ?? []).filter(
    (call) => call.method === method && call.url.startsWith(`/api/v1${path}`),
  );
}

/** Тело последнего такого запроса — что именно отправили. */
function body(method: string, path: string): Record<string, unknown> {
  const list = calls(method, path);
  return (list[list.length - 1]?.body ?? {}) as Record<string, unknown>;
}

function submitButton() {
  return screen.getByRole("button", { name: "Создать" });
}

/** Заглушка карточки лида: по ней видно, что переход состоялся. */
function LeadStub() {
  const { id } = useParams();
  return <p>Карточка лида {id}</p>;
}

/**
 * Окно на маршруте: переход после создания закрывает окно и открывает
 * карточку нового лида — как в приложении.
 */
function renderDialog(onClose: () => void = () => {}) {
  return renderWithDataRouter(
    <Routes>
      <Route path="/crm/leads/:id" element={<LeadStub />} />
      <Route path="*" element={<QuickCreateLeadDialog onClose={onClose} />} />
    </Routes>,
    { route: "/crm" },
  );
}

type Field = "name" | "inn" | "contact" | "phone";

/** Заполняет форму, пропуская указанное поле. */
async function fillForm(user: ReturnType<typeof userEvent.setup>, skip?: Field) {
  if (skip !== "name") await user.type(screen.getByLabelText("Название компании"), "ООО Вектор");
  if (skip !== "inn") await user.type(screen.getByLabelText("ИНН"), "7701234567");
  if (skip !== "contact") await user.type(screen.getByLabelText("Контакт логиста"), "Иванов");
  if (skip !== "phone") {
    await user.type(screen.getByLabelText("Телефон логиста"), "+7 900 111-22-33");
  }
}

/**
 * Настоящий сервер отвечает не мгновенно. Задерживаем только создание лида:
 * список этапов успевает прийти обычным путём, иначе проверка «нет этапов»
 * сработала бы раньше времени.
 */
function slowCreate(ms = 300) {
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") await new Promise((resolve) => setTimeout(resolve, ms));
    return inner(input, init);
  });
}

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

describe("Быстрое создание лида", () => {
  it("предупреждает о дубле ИНН, но не блокирует создание", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      {
        path: "/crm/customers/by-inn",
        response: [
          {
            id: 99,
            name: "ООО «Ромашка»",
            inn: "7701234567",
            assigned_to_id: 5,
            assigned_to_name: "Пётр Сидоров",
            is_archived: false,
            can_open: false,
            loss_reason_name: null,
            logist_contact: null,
            logist_phone: null,
            logist_email: null,
            priority: null,
            stage_name: null,
            tags: [],
            updated_at: "2026-10-01T10:00:00+03:00",
          },
        ],
      },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<QuickCreateLeadDialog onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText(/ООО/), "ООО Вектор");
    await user.type(screen.getByPlaceholderText("10 или 12 цифр"), "7701234567");

    await screen.findByText(/уже есть/);
    expect(screen.getByText(/Пётр Сидоров/)).toBeVisible();

    await user.type(screen.getByPlaceholderText("Фамилия Имя"), "Иванов");
    await user.type(screen.getByPlaceholderText(/\+7 900/), "+7 900 111-22-33");
    await user.click(screen.getByRole("button", { name: "Создать" }));

    await waitFor(() => expect(server?.called("POST", "/crm/leads")).toBe(true));
  });

  it("без совпадения по ИНН предупреждение не показывается", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [] },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<QuickCreateLeadDialog onClose={() => {}} />);

    await user.type(screen.getByPlaceholderText("10 или 12 цифр"), "7701234567");
    await waitFor(() => expect(server?.called("GET", "/crm/customers/by-inn")).toBe(true));

    expect(screen.queryByText(/уже есть/)).not.toBeInTheDocument();
  });
  it("пустая форма не уходит на сервер: отправку останавливают обязательные поля", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Новый лид" })).toBeVisible();
    await user.click(submitButton());

    // Все четыре поля помечены `required`: браузер не даёт отправить форму
    // и подсвечивает незаполненные — до собственной проверки дело не доходит.
    for (const label of ["Название компании", "ИНН", "Контакт логиста", "Телефон логиста"]) {
      expect(screen.getByLabelText(label)).toBeInvalid();
    }
    expect(calls("POST", "/crm/leads")).toHaveLength(0);
    expect(screen.getByRole("dialog", { name: "Новый лид" })).toBeVisible();
  });

  it("название из одних пробелов обязательное поле не закрывает", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "name");
    await user.type(screen.getByLabelText("Название компании"), "   ");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/crm/leads")).toHaveLength(0);
  });

  it("ИНН из одних пробелов обязательное поле не закрывает", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "inn");
    await user.type(screen.getByLabelText("ИНН"), "   ");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/crm/leads")).toHaveLength(0);
  });

  it("контакт из одних пробелов обязательное поле не закрывает", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "contact");
    await user.type(screen.getByLabelText("Контакт логиста"), "   ");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/crm/leads")).toHaveLength(0);
  });

  it("телефон из одних пробелов обязательное поле не закрывает", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user, "phone");
    await user.type(screen.getByLabelText("Телефон логиста"), "   ");
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);
    expect(calls("POST", "/crm/leads")).toHaveLength(0);
  });

  it("без этапов на доске лид не создаётся и об этом сообщается", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: [] },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(NO_STAGE_MESSAGE);
    expect(calls("POST", "/crm/leads")).toHaveLength(0);
  });

  it("создание лида: один запрос, поля обрезаны, берётся первый этап доски", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: TWO_STAGES },
      { path: "/crm/customers/by-inn", response: [] },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    const { router } = renderDialog();
    await user.type(screen.getByLabelText("Название компании"), "  ООО Вектор  ");
    await user.type(screen.getByLabelText("ИНН"), " 7701234567 ");
    await user.type(screen.getByLabelText("Контакт логиста"), "  Иванов  ");
    await user.type(screen.getByLabelText("Телефон логиста"), "  +7 900 111-22-33  ");
    await user.click(submitButton());

    expect(await screen.findByText("Карточка лида 42")).toBeVisible();
    await waitFor(() => expect(calls("POST", "/crm/leads")).toHaveLength(1));
    // Точное сравнение: ни лишнего поля, ни пропущенного.
    expect(body("POST", "/crm/leads")).toEqual({
      name: "ООО Вектор",
      inn: "7701234567",
      logist_contact: "Иванов",
      logist_phone: "+7 900 111-22-33",
      stage_id: 7,
    });
    expect(router.state.location.pathname).toBe("/crm/leads/42");
  });

  it("ошибка проверки ИНН объясняется понятными словами, а не текстом сервера", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [] },
      {
        method: "POST",
        path: "/crm/leads",
        response: { detail: "Unprocessable Entity" },
        status: 422,
      },
    ]);

    const user = userEvent.setup();
    const { router } = renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent(INN_MESSAGE);
    // Окно открыто, введённое на месте, адрес не изменился.
    expect(screen.getByLabelText("Название компании")).toHaveValue("ООО Вектор");
    expect(router.state.location.pathname).toBe("/crm");
  });

  it("прочие ошибки сервера показываются его словами", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [] },
      {
        method: "POST",
        path: "/crm/leads",
        response: { detail: "Номер занят" },
        status: 500,
      },
    ]);

    const user = userEvent.setup();
    const { router } = renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Номер занят");
    expect(router.state.location.pathname).toBe("/crm");
  });

  it("при обрыве связи показывается понятное сообщение", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [] },
    ]);
    // Сеть недоступна только для создания: список этапов приходит обычным путём,
    // иначе проверка «нет этапов» сработала бы раньше проверки связи.
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.reject(new TypeError("Failed to fetch"));
      return inner(input, init);
    });

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    expect(await screen.findByRole("alert")).toHaveTextContent("Не удалось создать лид");
    expect(screen.getByRole("dialog", { name: "Новый лид" })).toBeVisible();
  });

  it("пока ждём сервер, кнопка говорит «Создаём…» и не принимает повторных нажатий", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [] },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);
    slowCreate();

    const user = userEvent.setup();
    renderDialog();
    await fillForm(user);
    await user.click(submitButton());

    const pending = screen.getByRole("button", { name: "Создаём…" });
    expect(pending).toBeDisabled();
    // Нажатие по заблокированной кнопке не отправляет второй запрос.
    fireEvent.click(pending);

    expect(await screen.findByText("Карточка лида 42")).toBeVisible();
    await waitFor(() => expect(calls("POST", "/crm/leads")).toHaveLength(1));
  });

  it("прошлое сообщение стирается, когда форму отправляют снова", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [] },
      { method: "POST", path: "/crm/leads", response: CREATED_LEAD },
    ]);

    const user = userEvent.setup();
    const { router } = renderDialog();

    // Первая попытка с названием из пробелов: подсказка про обязательные поля.
    await fillForm(user, "name");
    await user.type(screen.getByLabelText("Название компании"), "   ");
    await user.click(submitButton());
    expect(await screen.findByRole("alert")).toHaveTextContent(REQUIRED_MESSAGE);

    // Исправляем название и отправляем снова: старая подсказка исчезает.
    await user.clear(screen.getByLabelText("Название компании"));
    await user.type(screen.getByLabelText("Название компании"), "ООО Вектор");
    slowCreate();
    await user.click(submitButton());

    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Создаём…" })).toBeDisabled();

    expect(await screen.findByText("Карточка лида 42")).toBeVisible();
    expect(router.state.location.pathname).toBe("/crm/leads/42");
  });

  it("дубль ИНН ищется только по полному номеру, а не с первой цифры", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [EXISTING_CUSTOMER] },
    ]);

    const user = userEvent.setup();
    renderDialog();

    // Девять цифр: номер ещё не дописан, запрос не уходит.
    await user.type(screen.getByLabelText("ИНН"), "770123456");
    expect(calls("GET", "/crm/customers/by-inn")).toHaveLength(0);
    expect(screen.queryByText(/уже есть/)).not.toBeInTheDocument();

    // Десятая цифра: номер полный, начинается поиск и появляется предупреждение.
    await user.type(screen.getByLabelText("ИНН"), "7");
    expect(await screen.findByText(/уже есть/)).toBeVisible();
    expect(calls("GET", "/crm/customers/by-inn").length).toBeGreaterThan(0);
  });

  it("предупреждение о дубле исчезает, когда номер снова стал коротким", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [EXISTING_CUSTOMER] },
    ]);

    const user = userEvent.setup();
    renderDialog();

    const inn = screen.getByLabelText("ИНН");
    await user.type(inn, "7701234567");
    expect(await screen.findByText(/уже есть/)).toBeVisible();

    await user.clear(inn);
    await waitFor(() => expect(screen.queryByText(/уже есть/)).not.toBeInTheDocument());
  });

  it("в предупреждении о дубле нет приписки про ответственного, если его нет", async () => {
    setAccessToken("токен");
    server = startFakeApi([
      { path: "/crm/stages", response: STAGES },
      { path: "/crm/customers/by-inn", response: [EXISTING_CUSTOMER_WITHOUT_OWNER] },
    ]);

    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText("ИНН"), "7701234567");
    const warning = await screen.findByText(/уже есть/);

    expect(warning).toHaveTextContent("ООО «Ромашка»");
    expect(warning).not.toHaveTextContent("ответственный");
  });

  it("«Отмена» закрывает окно", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(onClose);

    await user.click(screen.getByRole("button", { name: "Отмена" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape закрывает окно", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderDialog(onClose);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
