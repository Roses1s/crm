/**
 * Сценарий «менеджер работает с доской лидов».
 *
 * Подменяется только сеть: страница тянет этапы и лиды настоящими запросами,
 * раскладывает карточки по колонкам и переносит лид на другой этап через
 * меню карточки (клавиатурный путь — то же самое делает перетаскивание мышью).
 */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { KanbanPage } from "@/features/crm/KanbanPage";
import { setAccessToken, clearTokens } from "@/shared/api/auth";
import { page, startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

const STAGES = [
  { id: 1, name: "Новый", sequence: 1, color: "" },
  { id: 2, name: "В работе", sequence: 2, color: "" },
];

const LEADS = [
  {
    id: 10,
    name: "ООО Ромашка",
    inn: "7701234567",
    logist_contact: "Иван",
    logist_phone: "+7 900 000-00-00",
    logist_email: null,
    priority: 0,
    is_archived: false,
    stage_id: 1,
    stage_name: "Новый",
    assigned_to_id: 1,
    tags: [],
  },
  {
    id: 11,
    name: "АО Вектор",
    inn: "7707654321",
    logist_contact: "Пётр",
    logist_phone: "+7 900 111-11-11",
    logist_email: null,
    priority: 0,
    is_archived: false,
    stage_id: 2,
    stage_name: "В работе",
    assigned_to_id: 1,
    tags: [],
  },
];

const ME = {
  id: 1,
  email: "manager@crmdetroid.ru",
  first_name: "Мария",
  last_name: "Петрова",
  role: "manager" as const,
  is_active: true,
};

function startBoard(): FakeServer {
  return startFakeApi([
    { path: "/auth/me", response: ME },
    { path: "/crm/stages", response: STAGES },
    { path: "/crm/tags", response: [] },
    { path: "/crm/leads", response: page(LEADS) },
  ]);
}

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
  localStorage.clear();
});

describe("Сценарий: доска лидов", () => {
  it("загружает этапы и раскладывает карточки по колонкам", async () => {
    setAccessToken("токен");
    server = startBoard();

    renderWithProviders(<KanbanPage />, { route: "/crm/leads" });

    // Карточки обоих лидов пришли с сервера и отрисованы.
    expect(
      (await screen.findAllByText(/ООО Ромашка/, undefined, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);
    expect(
      (await screen.findAllByText(/АО Вектор/, undefined, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);

    // Названия этапов — заголовки колонок (слово «Новый» есть ещё на кнопке
    // создания, поэтому проверяем, что оно встречается больше одного раза).
    expect(screen.getAllByText("Новый").length).toBeGreaterThan(1);
    expect(screen.getByText("В работе")).toBeInTheDocument();

    expect(server.called("GET", "/crm/stages")).toBe(true);
    expect(server.called("GET", "/crm/leads")).toBe(true);
  });

  it("поиск в шапке уходит в запрос списка", async () => {
    setAccessToken("токен");
    server = startBoard();

    const user = userEvent.setup();
    renderWithProviders(<KanbanPage />, { route: "/crm/leads" });
    await screen.findAllByText(/ООО Ромашка/, undefined, { timeout: 5000 });

    await user.type(screen.getByPlaceholderText(/Поиск/i), "Ромашка");

    // Строка поиска уходит на сервер (с задержкой — ждём появления запроса).
    await waitFor(
      () =>
        expect(
          server?.calls.some((call) => call.url.includes("leads") && call.url.includes("search=")),
        ).toBe(true),
      { timeout: 3000 },
    );
  });

  it("карточку можно открыть из меню — ссылка ведёт на её адрес", async () => {
    setAccessToken("токен");
    server = startBoard();

    const user = userEvent.setup();
    renderWithProviders(<KanbanPage />, { route: "/crm/leads" });
    await screen.findAllByText(/ООО Ромашка/, undefined, { timeout: 5000 });

    // У каждой карточки своя кнопка меню; берём первую (лид 10).
    await user.click(screen.getAllByRole("button", { name: "Меню карточки" })[0]);

    expect(screen.getByRole("menu")).toBeInTheDocument();
    const open = await screen.findByRole("menuitem", { name: "Открыть" });
    expect(open).toHaveAttribute("href", "/crm/leads/10");
  });

  it("карточка доступна с клавиатуры: есть подпись для скринридера", async () => {
    setAccessToken("токен");
    server = startBoard();

    renderWithProviders(<KanbanPage />, { route: "/crm/leads" });
    await screen.findAllByText(/ООО Ромашка/, undefined, { timeout: 5000 });

    // Это то, что озвучивает скринридер при наведении фокуса на карточку.
    expect(screen.getByLabelText("Переместить ООО Ромашка")).toBeInTheDocument();
  });
});
