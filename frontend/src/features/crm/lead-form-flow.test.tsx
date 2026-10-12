/**
 * Сквозные сценарии карточки лида: создание, сохранение, смена этапа,
 * проигрыш, восстановление, удаление и передача.
 *
 * Подменяется только сеть (src/test/fake-api.ts), а страница, хуки и
 * HTTP-клиент — настоящие. Поэтому проверяется весь путь «клик → запрос →
 * ответ → экран», и видно не только то, что показано человеку, но и что
 * именно ушло на сервер: метод, адрес, тело и число повторов.
 *
 * Зачем отдельный файл: LeadFormPage.tsx (971 строка) предстоит разбирать на
 * части. Эти тесты фиксируют текущее поведение целиком, чтобы будущий разбор
 * не сломал сценарии незаметно. Продакшн-код здесь не трогаем — если тест
 * находит странность, она описывается в комментарии, а не исправляется.
 *
 * Отдельный раздел в конце проверяет блок «Информация о компании» после его
 * переноса в компонент (шаг 15): «Компания» — это то же название, что и
 * крупный заголовок, у новой карточки передача лида запрещена, а ошибка
 * передачи не «прилипает» к окну при повторном открытии.
 *
 * В самом конце — раздел про шапку карточки и полосу этапов: какая кнопка
 * какое окно открывает, что открытие окна ничего не отправляет на сервер,
 * куда ведёт листалка карточек и что «Лиды» возвращает на доску. Раньше эти
 * действия не исполнялись ни одним тестом — подмена «кнопка открывает чужое
 * окно» проходила незамеченной (такая поломка нашлась шагом 14 у кнопки
 * «Новый» и была записана отдельной задачей).
 *
 * Вкладка «Заявки» вынесена в конец файла: до этих проверок таблица заявок
 * в карточке лида не исполнялась ни одним тестом — тесты видели только пустой
 * список. Теперь зафиксированы состав колонок, попадание значений в свою
 * колонку, формат даты, прочерк вместо пустого перевозчика, ссылка на заявку,
 * счётчик в названии вкладки, пустое состояние, ожидание ответа и ошибка
 * загрузки, а также кнопка «Добавить заявку».
 *
 * Отдельно зафиксировано поведение, которое легко сломать случайно:
 * — имя и ИНН при отправке обрезаются по краям, контакт и телефон уходят как
 *   введены, а пустые e-mail и бухгалтер — как null (см. toPayload);
 * — формат ИНН на клиенте не проверяется (это делает сервер), в форме есть
 *   только предупреждение о дубле при ИНН от 10 цифр;
 * — после неудачного сохранения автосохранение замолкает до следующей правки.
 */
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useParams } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

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

const MANAGER = {
  ...ME,
  id: 2,
  email: "manager@example.com",
  role: "manager",
  first_name: "Денис",
  last_name: "Кузнецов",
};

const LEAD = {
  id: 10,
  name: "ООО Ромашка",
  inn: "7701234567",
  logist_contact: "Иван",
  logist_phone: "+7 900 000-00-00",
  logist_email: null,
  accountant_name: null as string | null,
  priority: 0,
  is_archived: false,
  loss_reason_id: null,
  loss_reason_name: null as string | null,
  stage_id: 1,
  stage_name: "Новый",
  assigned_to_id: 1,
  assigned_to_email: "admin@example.com",
  assigned_to_name: "Админов Админ",
  tags: [],
  created_at: "2026-10-01T10:00:00+03:00",
  updated_at: "2026-10-01T10:00:00+03:00",
};

// Два этапа: без второго нечего менять — вся проверка смены этапа и отката
// держится на переходе «Новый» → «В работе».
const STAGES = [
  { id: 1, name: "Новый", sequence: 1, color: "" },
  { id: 2, name: "В работе", sequence: 2, color: "" },
];

const LOSS_REASONS = [
  { id: 1, name: "Перестал возить" },
  { id: 2, name: "Ушёл к конкуренту" },
];

const COLLEAGUES = [
  { id: 2, first_name: "Денис", last_name: "Кузнецов", full_name: "Денис Кузнецов" },
];

/**
 * Заявки по лиду — полный набор полей, который требует схема ответа
 * (shipmentListItemSchema). Вторая заявка без перевозчика: в таблице он
 * показывается прочерком.
 */
const SHIPMENTS = [
  {
    id: 501,
    number: "З-501",
    lead_id: 10,
    lead_name: "ООО Ромашка",
    tags: [],
    seller_name: "Админов Админ",
    status: "checked",
    route: "Москва — Казань",
    carrier_name: "ООО «Перевозчик»",
    // Полдень по Гринвичу: дата «12.08.2026» остаётся той же в любом поясе,
    // поэтому проверка не зависит от часового пояса машины.
    created_at: "2026-08-12T12:00:00+00:00",
    margin: "15000.00",
    customer_total: "120000.00",
  },
  {
    id: 502,
    number: "З-502",
    lead_id: 10,
    lead_name: "ООО Ромашка",
    tags: [],
    seller_name: null,
    status: "loaded",
    route: "Санкт-Петербург — Тверь",
    carrier_name: "",
    created_at: "2026-09-01T12:00:00+00:00",
    margin: null,
    customer_total: null,
  },
];

let server: FakeServer | undefined;

afterEach(() => {
  vi.useRealTimers();
  server?.restore();
  server = undefined;
  clearTokens();
});

function renderLead(id: string) {
  return renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
        <Route path="/crm" element={<p>Доска CRM</p>} />
        {/* Заглушка карточки заявки: нужна, чтобы проверить ссылку из таблицы. */}
        <Route path="/shipments/:id" element={<ShipmentStub />} />
      </Routes>
    </ToastProvider>,
    { route: `/crm/leads/${id}` },
  );
}

function ShipmentStub() {
  const { id } = useParams();
  return <p>Карточка заявки {id}</p>;
}

/**
 * Адреса открытой карточки. Порядок важен: поддельный сервер берёт первое
 * совпадение по началу адреса, поэтому частные пути (.../timeline, .../pager)
 * должны идти раньше голого "/crm/leads/10".
 *
 * `leadResponse` принимает и функцию: тогда ответ читается «в момент запроса»
 * и карточка, обновлённая на сервере, приезжает обратно как настоящая.
 */
function leadRoutes(me: unknown = ME, leadResponse: unknown = LEAD, shipments: unknown = []) {
  return [
    { path: "/auth/me", response: me },
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
    { path: "/leads/10/shipments", response: shipments },
  ];
}

/** Адреса новой (ещё не созданной) карточки. */
function newLeadRoutes() {
  return [
    { path: "/auth/me", response: ME },
    { path: "/crm/stages", response: STAGES },
    { path: "/crm/tags", response: [] },
    { path: "/crm/customers/by-inn", response: [] },
  ];
}

/** Адреса карточки, созданной этим же тестом (id 55). */
function createdLeadRoutes(created: unknown) {
  return [
    { path: "/crm/leads/55/timeline", response: [] },
    {
      path: "/crm/leads/55/pager",
      response: { position: 1, total: 1, prev_id: null, next_id: null },
    },
    { path: "/crm/leads/55/attachments", response: [] },
    { path: "/crm/leads/55", response: created },
    { path: "/leads/55/shipments", response: [] },
  ];
}

/** Запросы, которые что-то меняют на сервере (не чтение). */
function writeCalls(): FakeServer["calls"] {
  return (server?.calls ?? []).filter((call) => call.method !== "GET");
}

/** Сколько раз ушёл такой запрос — например, чтобы поймать повтор. */
function countCalls(method: string, pathPart: string): number {
  return (server?.calls ?? []).filter(
    (call) => call.method === method && call.url.startsWith(`/api/v1${pathPart}`),
  ).length;
}

/** Тело последнего такого запроса — что именно отправили. */
function callBody(method: string, pathPart: string): Record<string, unknown> {
  const call = [...(server?.calls ?? [])]
    .reverse()
    .find((c) => c.method === method && c.url.startsWith(`/api/v1${pathPart}`));
  return (call?.body ?? {}) as Record<string, unknown>;
}

/**
 * Название активного этапа в полосе этапов. Единственный признак активного
 * этапа — aria-current="step" (см. FormStatusbar): в панели управления есть
 * своя кнопка «Новый», поэтому ищем не по подписи, а по этому признаку.
 */
function activeStage(): string {
  const active = screen
    .queryAllByRole("button")
    .find((button) => button.getAttribute("aria-current") === "step");
  return active?.textContent ?? "";
}

it("новая карточка без названия не уходит на сервер: показывается подсказка", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...newLeadRoutes(),
    // Путь создания заведомо описан: если запрос всё-таки уйдёт, его будет
    // видно в журнале, а не спишут на «неизвестный маршрут».
    { method: "POST", path: "/crm/leads", response: LEAD },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("new");

  const contact = await screen.findByRole("textbox", { name: "Контакт логиста/ЛПР" });
  await user.click(contact);
  await user.paste("Иван");
  await user.click(await screen.findByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Укажите название лида")).toBeVisible();
  expect(writeCalls()).toHaveLength(0);
  expect(router.state.location.pathname).toBe("/crm/leads/new");
});

it("создание лида: один POST с обрезанными полями и переход на новую карточку", async () => {
  setAccessToken("токен");
  const created = { ...LEAD, id: 55, name: "ООО Лютик", logist_contact: "  Иван  " };
  server = startFakeApi([
    ...createdLeadRoutes(created),
    ...newLeadRoutes(),
    { method: "POST", path: "/crm/leads", response: created },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("new");

  // Ждём, пока этапы загрузятся: этап по умолчанию (первый в воронке)
  // проставляется эффектом, без него тело запроса будет другим.
  await waitFor(() => expect(activeStage()).toBe("Новый"));

  const name = screen.getByRole("textbox", { name: "Название лида" });
  await user.click(name);
  await user.paste("  ООО Лютик  ");
  const inn = screen.getByRole("textbox", { name: "ИНН" });
  await user.click(inn);
  await user.paste("  7701234567  ");
  const contact = screen.getByRole("textbox", { name: "Контакт логиста/ЛПР" });
  await user.click(contact);
  await user.paste("  Иван  ");

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(countCalls("POST", "/crm/leads")).toBe(1));
  expect(callBody("POST", "/crm/leads")).toEqual({
    name: "ООО Лютик",
    inn: "7701234567",
    // Контакт уходит ровно так, как введён: обрезаются только имя и ИНН.
    logist_contact: "  Иван  ",
    logist_phone: "",
    // Пустые поля отправляются как null — так ждёт сервер.
    logist_email: null,
    accountant_name: null,
    priority: 0,
    stage_id: 1,
    tag_ids: [],
  });

  // Новую карточку сразу открываем по её адресу — второй раз её не создаём.
  await waitFor(() => expect(router.state.location.pathname).toBe("/crm/leads/55"));
  expect((await screen.findAllByDisplayValue("ООО Лютик")).length).toBeGreaterThan(0);
  expect(countCalls("POST", "/crm/leads")).toBe(1);
});

it("ошибка создания показывается в карточке, запрос не повторяется", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...newLeadRoutes(),
    { method: "POST", path: "/crm/leads", response: { detail: "Номер занят" }, status: 500 },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("new");

  const name = await screen.findByRole("textbox", { name: "Название лида" });
  await user.click(name);
  await user.paste("ООО Лютик");
  await user.click(await screen.findByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Номер занят")).toBeVisible();
  expect(countCalls("POST", "/crm/leads")).toBe(1);
  // Введённое осталось на месте: человеку есть что исправить и повторить.
  expect(screen.getByRole("textbox", { name: "Название лида" })).toHaveValue("ООО Лютик");
  expect(router.state.location.pathname).toBe("/crm/leads/new");
});

it("неверный ИНН: сервер отвечает 422, человек видит понятный текст", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      response: { detail: "ИНН не проходит проверку" },
      status: 422,
    },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  const inn = screen.getByRole("textbox", { name: "ИНН" });
  await user.clear(inn);
  await user.type(inn, "123");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  // Текст берётся не из ответа сервера, а из карточки: он объясняет, что делать.
  expect(
    await screen.findByText(/Проверьте поля: ИНН должен быть из 10 или 12 цифр/),
  ).toBeVisible();
  expect(callBody("PATCH", "/crm/leads/10")).toEqual({
    name: "ООО Ромашка",
    inn: "123",
    logist_contact: "Иван",
    logist_phone: "+7 900 000-00-00",
    logist_email: null,
    accountant_name: null,
    priority: 0,
    stage_id: 1,
    tag_ids: [],
    // Версия карточки, которую видел человек: без неё сервер не примет правку.
    expected_updated_at: "2026-10-01T10:00:00+03:00",
  });
  expect(countCalls("PATCH", "/crm/leads/10")).toBe(1);
});

it("телефон и e-mail уходят на сервер своими полями, лишних сохранений нет", async () => {
  setAccessToken("токен");
  let current: typeof LEAD = { ...LEAD };
  server = startFakeApi([
    ...leadRoutes(ME, () => current),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      response: (body: unknown) => {
        current = { ...current, ...(body as Partial<typeof LEAD>) };
        return current;
      },
    },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  const phone = screen.getByRole("textbox", { name: "Телефон логиста" });
  await user.clear(phone);
  await user.type(phone, "+7 900 111-22-33");
  const email = screen.getByRole("textbox", { name: "Email логиста" });
  await user.clear(email);
  await user.type(email, "logist@example.ru");

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  // Один запрос на две правки: телефон и почта уходят в свои поля, остальное
  // из формы не задето.
  await waitFor(() => expect(countCalls("PATCH", "/crm/leads/10")).toBe(1));
  expect(callBody("PATCH", "/crm/leads/10")).toEqual({
    name: "ООО Ромашка",
    inn: "7701234567",
    logist_contact: "Иван",
    logist_phone: "+7 900 111-22-33",
    logist_email: "logist@example.ru",
    accountant_name: null,
    priority: 0,
    stage_id: 1,
    tag_ids: [],
    expected_updated_at: "2026-10-01T10:00:00+03:00",
  });
  expect(countCalls("PATCH", "/crm/leads/10")).toBe(1);
});

it("нет прав на правку: отказ 403 и автосохранение молчит до следующей правки", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { method: "PATCH", path: "/crm/leads/10", response: { detail: "Нет прав" }, status: 403 },
  ]);

  // Часы поддельные: без них не проверить, что через три секунды запрос
  // не уходит повторно.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  renderLead("10");

  const contact = await screen.findByRole("textbox", { name: "Контакт логиста/ЛПР" });
  await user.click(contact);
  await user.paste("Пётр");
  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  expect(await screen.findByText("Недостаточно прав для этого действия")).toBeVisible();
  expect(countCalls("PATCH", "/crm/leads/10")).toBe(1);

  await act(async () => {
    await vi.advanceTimersByTimeAsync(3500);
  });
  expect(countCalls("PATCH", "/crm/leads/10")).toBe(1);
});

it("отмена правок возвращает прежние значения и ничего не отправляет", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes());

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  const contact = screen.getByRole("textbox", { name: "Контакт логиста/ЛПР" });
  await user.clear(contact);
  await user.type(contact, "Пётр");
  expect(contact).toHaveValue("Пётр");

  await user.click(screen.getByRole("button", { name: "Отменить изменения" }));

  expect(contact).toHaveValue("Иван");
  // Отменённые правки не должны уехать на сервер — ни сразу, ни автосохранением.
  expect(writeCalls()).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/crm/leads/10");
});

it("отмена правок у новой карточки уводит на доску", async () => {
  setAccessToken("токен");
  server = startFakeApi(newLeadRoutes());

  const user = userEvent.setup();
  const { router } = renderLead("new");

  const contact = await screen.findByRole("textbox", { name: "Контакт логиста/ЛПР" });
  await user.click(contact);
  await user.paste("Иван");
  await user.click(screen.getByRole("button", { name: "Отменить изменения" }));

  // Создавать нечего — возвращаемся к списку лидов.
  expect(await screen.findByText("Доска CRM")).toBeVisible();
  expect(router.state.location.pathname).toBe("/crm");
  expect(writeCalls()).toHaveLength(0);
});

it("смена этапа сохраняется сразу и становится активной", async () => {
  setAccessToken("токен");
  let current = { ...LEAD };
  server = startFakeApi([
    // Карточка читается «на момент запроса»: после смены этапа сервер отдаёт
    // уже обновлённую версию — как настоящий.
    ...leadRoutes(ME, () => current),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      response: (body: unknown) => {
        const patch = body as { stage_id?: number };
        current = {
          ...current,
          stage_id: patch.stage_id ?? current.stage_id,
          stage_name: "В работе",
          updated_at: "2026-10-02T10:00:00+03:00",
        };
        return current;
      },
    },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await waitFor(() => expect(activeStage()).toBe("Новый"));

  await user.click(screen.getByRole("button", { name: "В работе" }));

  await waitFor(() => expect(activeStage()).toBe("В работе"));
  // На сервер уходит только этап и версия карточки — ничего лишнего.
  expect(callBody("PATCH", "/crm/leads/10")).toEqual({
    stage_id: 2,
    expected_updated_at: "2026-10-01T10:00:00+03:00",
  });
  expect(countCalls("PATCH", "/crm/leads/10")).toBe(1);
  // Смена этапа уже сохранена: «грязных» правок не осталось.
  expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/crm/leads/10");
});

it("неудачная смена этапа откатывает полосу этапов и показывает ошибку", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      response: { detail: "Этап недоступен" },
      status: 500,
    },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await waitFor(() => expect(activeStage()).toBe("Новый"));

  await user.click(screen.getByRole("button", { name: "В работе" }));

  expect(await screen.findByText("Этап недоступен")).toBeVisible();
  await waitFor(() => expect(activeStage()).toBe("Новый"));
  // Откат полный: форма снова без несохранённых правок, адрес не изменился.
  expect(screen.queryByRole("button", { name: "Сохранить" })).not.toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/crm/leads/10");
});

it("проигрыш не отправится без выбранной причины", async () => {
  setAccessToken("токен");
  server = startFakeApi([...leadRoutes(), { path: "/crm/loss-reasons", response: LOSS_REASONS }]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Проигрыш" }));
  await screen.findByText("Перестал возить");

  const confirm = screen.getByRole("button", { name: "Отметить проигрышем" });
  expect(confirm).toBeDisabled();
  await user.click(confirm);

  expect(screen.getByRole("dialog", { name: "Отметка проигрыша" })).toBeVisible();
  expect(countCalls("POST", "/crm/leads/10/lose")).toBe(0);
  expect(router.state.location.pathname).toBe("/crm/leads/10");
});

it("проигрыш с причиной: POST с причиной и возврат на доску", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { path: "/crm/loss-reasons", response: LOSS_REASONS },
    { method: "POST", path: "/crm/leads/10/lose", response: null },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Проигрыш" }));
  await user.click(await screen.findByRole("radio", { name: "Перестал возить" }));
  const confirm = screen.getByRole("button", { name: "Отметить проигрышем" });
  await waitFor(() => expect(confirm).toBeEnabled());

  await user.click(confirm);

  await waitFor(() => expect(countCalls("POST", "/crm/leads/10/lose")).toBe(1));
  expect(callBody("POST", "/crm/leads/10/lose")).toEqual({ reason_id: 1 });
  // Лид ушёл с доски — карточку закрываем, чтобы не остаться на «мёртвом» адресе.
  expect(await screen.findByText("Доска CRM")).toBeVisible();
  expect(router.state.location.pathname).toBe("/crm");
});

it("ошибка проигрыша остаётся в диалоге, карточка никуда не уезжает", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { path: "/crm/loss-reasons", response: LOSS_REASONS },
    {
      method: "POST",
      path: "/crm/leads/10/lose",
      response: { detail: "Причина не найдена" },
      status: 404,
    },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Проигрыш" }));
  await user.click(await screen.findByRole("radio", { name: "Перестал возить" }));
  await user.click(screen.getByRole("button", { name: "Отметить проигрышем" }));

  const dialog = await screen.findByRole("dialog", { name: "Отметка проигрыша" });
  expect(await within(dialog).findByText("Причина не найдена")).toBeVisible();
  // Окно не закрылось: выбор причины не потерян, можно попробовать снова.
  expect(screen.getByRole("radio", { name: "Перестал возить" })).toBeChecked();
  expect(router.state.location.pathname).toBe("/crm/leads/10");
});

it("проигранная карточка только для чтения: «Взять себе» возвращает лид и снимает запрет", async () => {
  setAccessToken("токен");
  let current: typeof LEAD = {
    ...LEAD,
    is_archived: true,
    assigned_to_id: MANAGER.id,
    assigned_to_name: "Денис Кузнецов",
    loss_reason_name: "Перестал возить",
  };
  server = startFakeApi([
    ...leadRoutes(ME, () => current),
    {
      method: "POST",
      path: "/crm/leads/10/restore",
      response: () => {
        current = { ...current, is_archived: false, loss_reason_name: null };
        return null;
      },
    },
  ]);

  const user = userEvent.setup();
  renderLead("10");

  const names = await screen.findAllByDisplayValue("ООО Ромашка");
  expect(screen.getByLabelText("Лид проигран")).toBeVisible();
  names.forEach((input) => expect(input).toBeDisabled());
  // Поля блока «Информация о клиенте» тоже заблокированы: страница передаёт
  // в компонент признак «только для чтения», а не собственное правило.
  for (const label of ["Контакт логиста/ЛПР", "Телефон логиста", "Email логиста"]) {
    expect(screen.getByLabelText(label)).toBeDisabled();
  }
  expect(screen.getByRole("button", { name: "В работе" })).toBeDisabled();
  expect(screen.getByText(/сначала восстановите карточку/i)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Создать заявку" })).not.toBeInTheDocument();

  // Лид принадлежит другому продавцу — значит кнопка забирает его себе,
  // а не «восстанавливает» для прежнего владельца.
  expect(screen.queryByRole("button", { name: "Восстановить" })).not.toBeInTheDocument();
  const take = screen.getByRole("button", { name: "Взять себе" });
  expect(take).toHaveAttribute("title", "Забрать лид себе: он перейдёт на вашу доску");

  await user.click(take);

  await waitFor(() => expect(countCalls("POST", "/crm/leads/10/restore")).toBe(1));
  // Карточка вернулась с сервера уже не проигранной — запрет снят.
  await waitFor(() => expect(screen.queryByLabelText("Лид проигран")).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Название лида" })).toBeEnabled());
  for (const label of ["Контакт логиста/ЛПР", "Телефон логиста", "Email логиста"]) {
    await waitFor(() => expect(screen.getByLabelText(label)).toBeEnabled());
  }
});

it("«Удалить лид» не показывается тому, кто не администратор", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes(MANAGER));

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Действия" }));

  expect(screen.getByRole("button", { name: "Отметить проигрышем" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Удалить лид" })).not.toBeInTheDocument();
  expect(countCalls("DELETE", "/crm/leads/10/permanent")).toBe(0);
});

it("безвозвратное удаление: подтверждение, DELETE и возврат на доску", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { method: "DELETE", path: "/crm/leads/10/permanent", response: null },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(screen.getByRole("button", { name: "Удалить лид" }));

  const dialog = await screen.findByRole("dialog", { name: "Удаление лида" });
  expect(within(dialog).getByText("Удалить лид без возврата?")).toBeVisible();
  // Пока не подтвердили — не удалено ничего.
  expect(countCalls("DELETE", "/crm/leads/10/permanent")).toBe(0);

  await user.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));

  await waitFor(() => expect(countCalls("DELETE", "/crm/leads/10/permanent")).toBe(1));
  expect(await screen.findByText("Доска CRM")).toBeVisible();
  expect(router.state.location.pathname).toBe("/crm");
});

it("передача лида: два шага, POST с выбранным сотрудником и возврат на доску", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { path: "/users/colleagues", response: COLLEAGUES },
    { method: "POST", path: "/crm/leads/10/transfer", response: null },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByTitle("Передать лид другому сотруднику"));
  expect(await screen.findByRole("dialog", { name: "Передача лида" })).toBeVisible();

  await user.click(await screen.findByRole("button", { name: "Денис Кузнецов" }));

  // Второй шаг — подтверждение: до него запрос не уходит (случайный щелчок
  // не должен передавать карточку).
  expect(screen.getByText(/перейдёт к сотруднику/)).toBeVisible();
  expect(countCalls("POST", "/crm/leads/10/transfer")).toBe(0);

  await user.click(screen.getByRole("button", { name: "Передать" }));

  await waitFor(() => expect(countCalls("POST", "/crm/leads/10/transfer")).toBe(1));
  expect(callBody("POST", "/crm/leads/10/transfer")).toEqual({ user_id: 2 });
  expect(await screen.findByText("Доска CRM")).toBeVisible();
  expect(router.state.location.pathname).toBe("/crm");
});

it("проигранная карточка: передача лида доступна администратору и запрещена остальным", async () => {
  const lostLead = {
    ...LEAD,
    is_archived: true,
    assigned_to_id: MANAGER.id,
    assigned_to_name: "Денис Кузнецов",
    loss_reason_name: "Перестал возить",
  };

  // Не-администратор: у проигранной карточки передача запрещена, и подсказка
  // объясняет, что сначала нужно вернуть лид. Это единственная проверка,
  // которая ловит ошибку «страница всегда передаёт isAdmin = true»: сам блок
  // роль не считает, он только получает готовый флаг со страницы.
  setAccessToken("токен");
  server = startFakeApi(leadRoutes(MANAGER, lostLead));
  const managerView = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  const blocked = screen.getByTitle("Сначала восстановите лид, чтобы передать его");
  expect(blocked).toBeDisabled();
  managerView.unmount();

  // Администратор: проигранный лид передать можно — карточка вернётся на
  // доску получателя, поэтому правило для админа мягче.
  server = startFakeApi(leadRoutes(ME, lostLead));
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  expect(screen.getByTitle("Передать лид другому сотруднику")).toBeEnabled();
});

// --- блок «Информация о компании» в карточке лида ---------------------------
// Блок вынесен в отдельный компонент (шаг 15), но три вещи остаются заботой
// страницы, и их обязательно проверять целиком: название из «Компании» — это
// то же поле, что и крупный заголовок карточки; у новой карточки передача лида
// запрещена, пока лид не сохранён; ошибка передачи не должна «прилипать» к
// окну и показываться при следующем открытии. Проверки компонента этого не
// видят — они смотрят только сам блок.

it("«Компания» — то же название, что и крупный заголовок: правка уходит в payload.name", async () => {
  setAccessToken("токен");
  let current: typeof LEAD = { ...LEAD };
  server = startFakeApi([
    ...leadRoutes(ME, () => current),
    {
      method: "PATCH",
      path: "/crm/leads/10",
      response: (body: unknown) => {
        current = { ...current, ...(body as Partial<typeof LEAD>) };
        return current;
      },
    },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  const company = screen.getByRole("textbox", { name: "Компания" });
  await user.clear(company);
  await user.click(company);
  await user.paste("ООО Лютик");

  // Крупный заголовок и поле «Компания» — одно и то же название (form.name):
  // правка сразу видна в заголовке, отдельного поля в базе нет.
  expect(screen.getByRole("textbox", { name: "Название лида" })).toHaveValue("ООО Лютик");
  // Лид активный — строки «Причина проигрыша» в блоке нет.
  expect(screen.queryByText("Причина проигрыша")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Сохранить" }));

  await waitFor(() => expect(countCalls("PATCH", "/crm/leads/10")).toBe(1));
  expect(callBody("PATCH", "/crm/leads/10").name).toBe("ООО Лютик");
  expect(countCalls("PATCH", "/crm/leads/10")).toBe(1);
});

it("новая карточка: передача лида недоступна и объясняет почему", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...newLeadRoutes(),
    // Маршрут коллег описан заранее: если окно передачи всё-таки откроется,
    // запрос будет видно в журнале, а не спишут на «неизвестный маршрут».
    { path: "/users/colleagues", response: COLLEAGUES },
  ]);

  const user = userEvent.setup();
  renderLead("new");
  await screen.findByRole("textbox", { name: "Компания" });

  const seller = screen.getByTitle("Сначала сохраните лид");
  expect(seller).toBeDisabled();

  await user.click(seller);
  expect(screen.queryByRole("dialog", { name: "Передача лида" })).not.toBeInTheDocument();
  // Список коллег не запрашивается: передавать пока нечего — лида ещё нет.
  expect(countCalls("GET", "/users/colleagues")).toBe(0);
});

it("ошибка передачи не показывается при повторном открытии окна", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { path: "/users/colleagues", response: COLLEAGUES },
    {
      method: "POST",
      path: "/crm/leads/10/transfer",
      response: { detail: "Нет прав на передачу" },
      status: 403,
    },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByTitle("Передать лид другому сотруднику"));
  await user.click(await screen.findByRole("button", { name: "Денис Кузнецов" }));
  await user.click(screen.getByRole("button", { name: "Передать" }));

  const dialog = await screen.findByRole("dialog", { name: "Передача лида" });
  expect(await within(dialog).findByText("Нет прав на передачу")).toBeVisible();
  expect(countCalls("POST", "/crm/leads/10/transfer")).toBe(1);

  // Закрываем окно и открываем снова: прежняя ошибка не должна встречать
  // человека на втором шаге — она относилась к прошлой попытке.
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Передача лида" })).not.toBeInTheDocument(),
  );

  await user.click(screen.getByTitle("Передать лид другому сотруднику"));
  await user.click(await screen.findByRole("button", { name: "Денис Кузнецов" }));

  expect(screen.getByText(/перейдёт к сотруднику/)).toBeVisible();
  expect(screen.queryByText("Нет прав на передачу")).not.toBeInTheDocument();
  expect(countCalls("POST", "/crm/leads/10/transfer")).toBe(1);
});

// --- вкладка «Заявки» в карточке лида ---------------------------------------
// Таблица заявок рисуется целиком в LeadFormPage.tsx и раньше не проверялась
// ни одной строкой: тесты видели только пустой список. Здесь фиксируется
// состав колонок, попадание данных в нужную колонку, формат даты, прочерк
// вместо пустого перевозчика, ссылка на заявку и действие кнопки.

/** Заголовки колонок в порядке, как в разметке. */
const SHIPMENT_HEADERS = ["№", "Дата создания", "Маршрут", "Перевозчик", "Статус"];

it("вкладка «Заявки»: строки, колонки и значения полей", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes(ME, LEAD, SHIPMENTS));

  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  // Счётчик в названии вкладки берётся из загруженного списка.
  expect(await screen.findByRole("button", { name: "Заявки (2)" })).toBeVisible();
  // Пустая строка уступает место данным.
  expect(screen.queryByText("Пока нет заявок по этому лиду.")).not.toBeInTheDocument();

  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(3); // шапка и две заявки — ничего лишнего
  expect(
    within(rows[0]!)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent),
  ).toEqual(SHIPMENT_HEADERS);

  const first = rows[1]!;
  // Номер заявки — ссылка на её карточку, в колонке «№».
  expect(within(first).getByRole("link", { name: "З-501" })).toHaveAttribute(
    "href",
    "/shipments/501",
  );
  // Дата — в формате «дд.мм.гггг чч:мм:сс» (проверяется вся клетка целиком).
  expect(within(first).getByText(/^12\.08\.2026 \d{2}:\d{2}:\d{2}$/)).toBeVisible();
  // Маршрут попадает в свою колонку и дублируется подсказкой (полный текст
  // виден при наведении, если колонка узкая).
  expect(within(first).getByTitle("Москва — Казань")).toBeVisible();
  expect(within(first).getByText("ООО «Перевозчик»")).toBeVisible();
  expect(within(first).getByText("Проверена и подписана заявка")).toBeVisible();

  const second = rows[2]!;
  expect(within(second).getByRole("link", { name: "З-502" })).toHaveAttribute(
    "href",
    "/shipments/502",
  );
  expect(within(second).getByText(/^01\.09\.2026 \d{2}:\d{2}:\d{2}$/)).toBeVisible();
  expect(within(second).getByText("Санкт-Петербург — Тверь")).toBeVisible();
  // Перевозчика нет — в колонке прочерк, а не пустое место.
  expect(within(second).getByText("—")).toBeVisible();
  expect(within(second).getByText("Машина загрузилась")).toBeVisible();

  // Список заявок запрошен один раз и у нужного лида.
  expect(countCalls("GET", "/leads/10/shipments")).toBe(1);
});

it("каждая строка ведёт на свою заявку", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes(ME, LEAD, SHIPMENTS));

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findByRole("button", { name: "Заявки (2)" });

  // Вторая строка: ссылка обязана вести на 502, а не на первую заявку.
  await user.click(screen.getByRole("link", { name: "З-502" }));

  expect(await screen.findByText("Карточка заявки 502")).toBeVisible();
  expect(router.state.location.pathname).toBe("/shipments/502");
});

it("пустой список: пояснение вместо строк и кнопка «Добавить заявку»", async () => {
  setAccessToken("токен");
  // Пустой ответ — настройка по умолчанию в leadRoutes.
  server = startFakeApi(leadRoutes());

  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  expect(await screen.findByRole("button", { name: "Заявки (0)" })).toBeVisible();
  expect(screen.getByText("Пока нет заявок по этому лиду.")).toBeVisible();

  // Шапка и одна строка с пояснением — данных нет.
  const rows = screen.getAllByRole("row");
  expect(rows).toHaveLength(2);
  expect(within(rows[1]!).queryByRole("link")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Добавить заявку" })).toBeVisible();
  expect(countCalls("GET", "/leads/10/shipments")).toBe(1);
});

it("пока заявки не пришли — пустой список, после ответа строки и счётчик", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes(ME, LEAD, SHIPMENTS));

  // Своего состояния ожидания у блока нет: пока ответ в пути, видно ту же
  // пустую строку. Чтобы это поймать, придерживаем ответ до сигнала.
  const fakeFetch = globalThis.fetch;
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/leads/10/shipments")) await gate;
    return fakeFetch(input, init);
  });

  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  expect(screen.getByRole("button", { name: "Заявки (0)" })).toBeVisible();
  expect(screen.getByText("Пока нет заявок по этому лиду.")).toBeVisible();

  await act(async () => {
    release();
  });

  expect(await screen.findByRole("button", { name: "Заявки (2)" })).toBeVisible();
  expect(screen.queryByText("Пока нет заявок по этому лиду.")).not.toBeInTheDocument();
  expect(screen.getAllByRole("row")).toHaveLength(3);
});

it("ошибка загрузки заявок не роняет карточку и не повторяется", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes().filter((route) => route.path !== "/leads/10/shipments"),
    { path: "/leads/10/shipments", response: { detail: "Сервер прилёг" }, status: 500 },
  ]);

  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  // Своего сообщения об ошибке у вкладки нет — она показывает пустой список,
  // а карточка продолжает работать. Текст ошибки уходит в консоль React Query.
  expect(await screen.findByRole("button", { name: "Заявки (0)" })).toBeVisible();
  expect(screen.getByText("Пока нет заявок по этому лиду.")).toBeVisible();
  expect(screen.getByRole("textbox", { name: "Название лида" })).toHaveValue("ООО Ромашка");
  expect(countCalls("GET", "/leads/10/shipments")).toBe(1);
});

it("«Добавить заявку» открывает быстрое создание заявки и ничего не отправляет", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes());

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Добавить заявку" }));

  expect(await screen.findByRole("dialog", { name: "Новая заявка" })).toBeVisible();
  // Пока форму не заполнили и не отправили, на сервер ничего не уходит.
  expect(writeCalls()).toHaveLength(0);
});

it("у новой карточки вкладки заявок нет и запрос за заявками не уходит", async () => {
  setAccessToken("токен");
  server = startFakeApi(newLeadRoutes());

  renderLead("new");
  await screen.findByRole("textbox", { name: "Название лида" });

  expect(screen.queryByRole("button", { name: /^Заявки \(/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Добавить заявку" })).not.toBeInTheDocument();
  // У новой карточки нет id — заявки за ней запрашивать нечего.
  expect((server?.calls ?? []).filter((call) => call.url.includes("/shipments"))).toHaveLength(0);
});

// --- шапка карточки и полоса этапов ----------------------------------------
// Кнопки шапки и полосы этапов открывают окна и уводят на другие экраны.
// До этого раздела их действия не исполнялись ни одним тестом: подмена
// «кнопка открывает чужое окно» проходила незамеченной — такая поломка
// нашлась на шаге 14 у кнопки «Новый» и была записана отдельной задачей.
// Здесь зафиксировано: какая кнопка какое окно открывает, что открытие окна
// ничего не отправляет на сервер, куда ведёт листалка карточек и как ведут
// себя её крайние кнопки, а также что «Лиды» возвращает на доску.

/**
 * Адреса одной карточки лида с заданной листалкой. Порядок тот же, что
 * в `leadRoutes`: частные пути (.../timeline, .../pager) идут раньше голого
 * адреса карточки, иначе поддельный сервер ответил бы карточкой на запрос
 * листалки.
 */
function leadRoutesWithPager(id: number, lead: unknown, pager: unknown) {
  return [
    { path: `/crm/leads/${id}/timeline`, response: [] },
    { path: `/crm/leads/${id}/pager`, response: pager },
    { path: `/crm/leads/${id}/attachments`, response: [] },
    { path: `/crm/leads/${id}`, response: lead },
    { path: `/leads/${id}/shipments`, response: [] },
  ];
}

/** Соседи карточки 10: слева лид 9, справа — 11; по ним проверяется листалка. */
const LEAD_LEFT = { ...LEAD, id: 9, name: "ООО Лютик", inn: "7700000001" };
const LEAD_RIGHT = { ...LEAD, id: 11, name: "ООО Вектор", inn: "7700000002" };

function pagerRoutes() {
  return [
    { path: "/auth/me", response: ME },
    { path: "/crm/stages", response: STAGES },
    { path: "/crm/tags", response: [] },
    { path: "/crm/customers/by-inn", response: [] },
    ...leadRoutesWithPager(9, LEAD_LEFT, { position: 1, total: 3, prev_id: null, next_id: 10 }),
    ...leadRoutesWithPager(10, LEAD, { position: 2, total: 3, prev_id: 9, next_id: 11 }),
    ...leadRoutesWithPager(11, LEAD_RIGHT, { position: 3, total: 3, prev_id: 10, next_id: null }),
  ];
}

/**
 * Кнопка «Новый» в шапке карточки. В полосе этапов есть этап с тем же
 * названием — его кнопка помечена `aria-current="step"` как активный этап,
 * поэтому у кнопки шапки такой пометки нет.
 */
function headerNewButton(): HTMLElement {
  const found = screen
    .getAllByRole("button", { name: "Новый" })
    .find((button) => !button.hasAttribute("aria-current"));
  if (!found) throw new Error("Кнопка «Новый» в шапке карточки не найдена");
  return found;
}

it("«Новый» в шапке открывает окно нового лида и ничего не отправляет", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    // Маршрут создания описан заранее: если запрос всё-таки уйдёт, его будет
    // видно в журнале, а не спишут на «неизвестный маршрут».
    { method: "POST", path: "/crm/leads", response: LEAD },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(headerNewButton());

  expect(await screen.findByRole("dialog", { name: "Новый лид" })).toBeVisible();
  // Окно заявки — другое действие другой кнопки: здесь его быть не должно.
  expect(screen.queryByRole("dialog", { name: "Новая заявка" })).not.toBeInTheDocument();
  // Открытие окна ничего не создаёт на сервере.
  expect(writeCalls()).toHaveLength(0);

  // Закрыли и открыли снова: окно открывается так же, состояние не «залипает».
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Новый лид" })).not.toBeInTheDocument(),
  );
  await user.click(headerNewButton());
  expect(await screen.findByRole("dialog", { name: "Новый лид" })).toBeVisible();
  expect(countCalls("POST", "/crm/leads")).toBe(0);
});

it("«Действия → Отметить проигрышем» открывает окно проигрыша и не меняет лид", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { path: "/crm/loss-reasons", response: LOSS_REASONS },
    // Подтверждение проигрыша здесь не нажимается — маршрут нужен, чтобы
    // случайный запрос был виден в журнале, а не считался «неизвестным».
    { method: "POST", path: "/crm/leads/10/lose", response: null },
  ]);

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(screen.getByRole("button", { name: "Отметить проигрышем" }));

  expect(await screen.findByRole("dialog", { name: "Отметка проигрыша" })).toBeVisible();
  // Открытие окна ничего не решает: лид остаётся активным, запись не уходит.
  expect(countCalls("POST", "/crm/leads/10/lose")).toBe(0);
  expect(writeCalls()).toHaveLength(0);
  expect(router.state.location.pathname).toBe("/crm/leads/10");
  expect(activeStage()).toBe("Новый");
  expect(screen.queryByLabelText("Лид проигран")).not.toBeInTheDocument();
});

/**
 * Пункты меню «Действия» делают три вещи по порядку: закрывают меню,
 * стирают прошлую ошибку и открывают своё окно. Проверяем это на странице
 * целиком: ошибка специально доводится до показа, окно закрывается, а затем
 * открывается снова из меню — старой ошибки быть не должно, а меню должно
 * быть закрыто (внутри меню нет пункта удаления, пока окно открыто).
 */
it("пункт «Отметить проигрышем»: меню закрывается, старая ошибка стирается, окно открывается", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { path: "/crm/loss-reasons", response: LOSS_REASONS },
    {
      method: "POST",
      path: "/crm/leads/10/lose",
      response: { detail: "Причина не найдена" },
      status: 404,
    },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  // Первая попытка: открываем из меню и получаем ошибку от сервера.
  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(screen.getByRole("button", { name: "Отметить проигрышем" }));

  const dialog = await screen.findByRole("dialog", { name: "Отметка проигрыша" });
  // Меню закрылось вместе с открытием окна: пункта удаления рядом уже нет.
  expect(screen.queryByRole("button", { name: "Удалить лид" })).not.toBeInTheDocument();

  await user.click(await screen.findByRole("radio", { name: "Перестал возить" }));
  await user.click(within(dialog).getByRole("button", { name: "Отметить проигрышем" }));
  expect(await within(dialog).findByText("Причина не найдена")).toBeVisible();

  // Закрываем окно, не подтверждая: ошибка осталась в состоянии страницы —
  // значит, её можно стереть только при следующем открытии.
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Отметка проигрыша" })).not.toBeInTheDocument(),
  );

  // Открываем снова из меню: меню закрыто, окно открыто, прежней ошибки нет.
  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(screen.getByRole("button", { name: "Отметить проигрышем" }));

  const again = await screen.findByRole("dialog", { name: "Отметка проигрыша" });
  expect(screen.queryByRole("button", { name: "Удалить лид" })).not.toBeInTheDocument();
  expect(within(again).queryByText("Причина не найдена")).not.toBeInTheDocument();
  // Ничего не переотправлялось: второй раз мы окно только открыли.
  expect(countCalls("POST", "/crm/leads/10/lose")).toBe(1);
});

it("пункт «Удалить лид»: меню закрывается, старая ошибка стирается, окно открывается", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    {
      method: "DELETE",
      path: "/crm/leads/10/permanent",
      response: { detail: "Лид уже удалён" },
      status: 404,
    },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(screen.getByRole("button", { name: "Удалить лид" }));

  const dialog = await screen.findByRole("dialog", { name: "Удаление лида" });
  // Меню закрыто: пункта проигрыша рядом уже нет.
  expect(screen.queryByRole("button", { name: "Отметить проигрышем" })).not.toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));
  expect(await within(dialog).findByText("Лид уже удалён")).toBeVisible();

  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Удаление лида" })).not.toBeInTheDocument(),
  );

  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(screen.getByRole("button", { name: "Удалить лид" }));

  const again = await screen.findByRole("dialog", { name: "Удаление лида" });
  expect(screen.queryByRole("button", { name: "Отметить проигрышем" })).not.toBeInTheDocument();
  expect(within(again).queryByText("Лид уже удалён")).not.toBeInTheDocument();
  expect(countCalls("DELETE", "/crm/leads/10/permanent")).toBe(1);
});

it("у проигранного лида пункта «Отметить проигрышем» в меню нет", async () => {
  const lostLead = {
    ...LEAD,
    is_archived: true,
    assigned_to_id: MANAGER.id,
    assigned_to_name: "Денис Кузнецов",
    loss_reason_name: "Перестал возить",
  };
  setAccessToken("токен");
  server = startFakeApi(leadRoutes(ME, lostLead));

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Действия" }));

  // Администратор по-прежнему может удалить лид, а отметить проигрышем
  // уже проигранный нельзя: этого пункта в меню нет.
  expect(screen.getByRole("button", { name: "Удалить лид" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Отметить проигрышем" })).not.toBeInTheDocument();
});

/**
 * Настоящий сервер отвечает не мгновенно: пока запрос в пути, видны состояния
 * ожидания. Так же сделано в тестах автосохранения заявки — иначе состояние
 * «идёт запрос» не поймать: ответ приходит до следующей отрисовки.
 */
function slowResponses(ms = 400) {
  const fakeFetch = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    return fakeFetch(input, init);
  });
}

it("шапка показывает число заявок лида, а не что-то другое", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes(ME, LEAD, SHIPMENTS));

  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  // В шапке — «Все заявки» со числом самого лида (в фикстуре их две).
  const stats = screen.getByText("Все заявки").parentElement!;
  await waitFor(() => expect(within(stats).getByText("2")).toBeVisible());
});

it("у лида без заявок счётчик в шапке показывает ноль", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes());

  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  const stats = screen.getByText("Все заявки").parentElement!;
  await waitFor(() => expect(within(stats).getByText("0")).toBeVisible());
});

it("во время удаления пункт «Удалить лид» в меню заблокирован", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { method: "DELETE", path: "/crm/leads/10/permanent", response: null },
  ]);
  slowResponses();

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Действия" }));
  await user.click(screen.getByRole("button", { name: "Удалить лид" }));

  const dialog = await screen.findByRole("dialog", { name: "Удаление лида" });
  await user.click(within(dialog).getByRole("button", { name: "Удалить навсегда" }));

  // Пока запрос в пути, окно показывает ожидание.
  expect(await within(dialog).findByRole("button", { name: "Удаляем…" })).toBeDisabled();

  // Открываем меню прямо поверх окна — обычным нажатием не выйдет: под окном
  // лежит подложка, поэтому клик отправляем прямо в шестерёнку. Пункт удаления
  // в этот момент должен быть недоступен, как было и до переноса шапки.
  fireEvent.click(screen.getByRole("button", { name: "Действия" }));
  expect(screen.getByRole("button", { name: "Удалить лид" })).toBeDisabled();

  await waitFor(() => expect(router.state.location.pathname).toBe("/crm"));
});

it("«Создать заявку» в полосе этапов открывает окно новой заявки", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    // Маршрут создания заявки описан заранее: если запрос уйдёт до
    // подтверждения, он будет виден в журнале.
    { method: "POST", path: "/shipments", response: LEAD },
  ]);

  const user = userEvent.setup();
  renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("button", { name: "Создать заявку" }));

  expect(await screen.findByRole("dialog", { name: "Новая заявка" })).toBeVisible();
  // Окно нового лида — другое действие: кнопки не должны путать окна.
  expect(screen.queryByRole("dialog", { name: "Новый лид" })).not.toBeInTheDocument();
  // До подтверждения заявка не создаётся.
  expect(countCalls("POST", "/shipments")).toBe(0);
  expect(writeCalls()).toHaveLength(0);
});

it("листалка ведёт на предыдущий и следующий лид по своим адресам", async () => {
  setAccessToken("токен");
  server = startFakeApi(pagerRoutes());

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");
  expect(screen.getByText("2 / 3")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Предыдущий лид" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/crm/leads/9"));
  // Открылась именно соседняя карточка — со своим названием и своим счётчиком.
  await screen.findAllByDisplayValue("ООО Лютик");
  expect(screen.getByText("1 / 3")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Следующий лид" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/crm/leads/10"));
  await screen.findAllByDisplayValue("ООО Ромашка");
  expect(screen.getByText("2 / 3")).toBeVisible();
});

it("на краях списка кнопки листалки заблокированы, у соседа — доступны", async () => {
  setAccessToken("токен");
  server = startFakeApi(pagerRoutes());

  // Первая карточка списка: назад идти некуда, вперёд — можно.
  const first = renderLead("9");
  await screen.findAllByDisplayValue("ООО Лютик");
  expect(screen.getByText("1 / 3")).toBeVisible();
  expect(screen.getByRole("button", { name: "Предыдущий лид" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Следующий лид" })).toBeEnabled();
  first.unmount();

  // Последняя карточка списка: наоборот.
  renderLead("11");
  await screen.findAllByDisplayValue("ООО Вектор");
  expect(screen.getByText("3 / 3")).toBeVisible();
  expect(screen.getByRole("button", { name: "Предыдущий лид" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Следующий лид" })).toBeDisabled();
});

it("«Лиды» в шапке возвращает на доску", async () => {
  setAccessToken("токен");
  server = startFakeApi(leadRoutes());

  const user = userEvent.setup();
  const { router } = renderLead("10");
  await screen.findAllByDisplayValue("ООО Ромашка");

  await user.click(screen.getByRole("link", { name: "Лиды" }));

  await waitFor(() => expect(router.state.location.pathname).toBe("/crm"));
  expect(await screen.findByText("Доска CRM")).toBeVisible();
});
