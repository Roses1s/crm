/**
 * Предупреждение о дубле ИНН должно работать не только при быстром создании
 * лида, но и при редактировании уже существующей карточки — при этом сам
 * редактируемый лид не должен «находить дубль самого себя» (exclude_id).
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, expect, it } from "vitest";

import { LeadFormPage } from "./LeadFormPage";
import { setAccessToken, clearTokens } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { ToastProvider } from "@/shared/ui/toast";
import { renderWithDataRouter } from "@/test/utils";

function renderLead(id: string) {
  return renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
        <Route path="/crm" element={<p>Доска CRM</p>} />
      </Routes>
    </ToastProvider>,
    { route: `/crm/leads/${id}` },
  );
}

const ME = { id: 1, email: "admin@example.com", role: "admin", first_name: "А", last_name: "Б" };

const LEAD = {
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
  assigned_to_name: "Админов Админ",
  tags: [],
  created_at: "2026-10-01T10:00:00+03:00",
  updated_at: "2026-10-01T10:00:00+03:00",
};

const STAGES = [{ id: 1, name: "Новый", sequence: 1, color: "" }];

let server: FakeServer | undefined;
afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

function commonRoutes(me = ME, lead = LEAD) {
  // Важен порядок: более специфичные пути (.../timeline, .../pager, ...)
  // должны идти раньше голого "/crm/leads/10" — у поддельного сервера
  // сопоставление через startsWith, первое совпадение побеждает.
  return [
    { path: "/auth/me", response: me },
    { path: "/crm/leads/10/timeline", response: [] },
    { path: "/crm/leads/10/pager", response: { position: 1, total: 1 } },
    { path: "/crm/leads/10/attachments", response: [] },
    { path: "/crm/leads/10", response: lead },
    { path: "/crm/stages", response: STAGES },
    { path: "/crm/tags", response: [] },
    { path: "/leads/10/shipments", response: [] },
  ];
}

it("предупреждает о дубле ИНН при редактировании существующего лида", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...commonRoutes(),
    {
      path: "/crm/customers/by-inn",
      response: [
        {
          id: 99,
          name: "ООО «Вектор»",
          inn: "7701234567",
          assigned_to_id: 2,
          assigned_to_name: "Пётр Сидоров",
          is_archived: false,
          can_open: false,
          logist_contact: null,
        },
      ],
    },
  ]);

  renderLead("10");

  await screen.findByText(/уже есть/);
  expect(screen.getByText(/Пётр Сидоров/)).toBeVisible();

  // Запрос обязан исключать сам редактируемый лид (exclude_id=10).
  await waitFor(() =>
    expect(
      server?.calls.some(
        (c) => c.url.includes("/crm/customers/by-inn") && c.url.includes("exclude_id=10"),
      ),
    ).toBe(true),
  );
});

it("без совпадения по ИНН у другого лида предупреждение не показывается", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), { path: "/crm/customers/by-inn", response: [] }]);

  renderLead("10");

  await screen.findAllByDisplayValue("ООО Ромашка");
  await waitFor(() => expect(server?.called("GET", "/crm/customers/by-inn")).toBe(true));
  expect(screen.queryByText(/уже есть/)).not.toBeInTheDocument();
});

it("показывает проигранную карточку прежнему ответственному только для чтения", async () => {
  setAccessToken("токен");
  const manager = {
    ...ME,
    id: 2,
    email: "manager@example.com",
    role: "manager",
    first_name: "Денис",
    last_name: "Кузнецов",
  };
  const lostLead = {
    ...LEAD,
    is_archived: true,
    assigned_to_id: manager.id,
    assigned_to_name: "Денис Кузнецов",
    loss_reason_name: "Перестал возить",
  };
  server = startFakeApi([
    ...commonRoutes(manager, lostLead),
    { path: "/crm/customers/by-inn", response: [] },
  ]);

  renderLead("10");

  const nameInputs = await screen.findAllByDisplayValue("ООО Ромашка");
  expect(nameInputs).toHaveLength(2);
  nameInputs.forEach((input) => expect(input).toBeDisabled());
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Теги" })).toBeDisabled();
  expect(screen.getByRole("textbox", { name: "Текст внутреннего примечания" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Восстановить" })).toBeVisible();
  expect(screen.getByText(/сначала восстановите карточку/i)).toBeVisible();
});

it("предупреждает об уходе с новой карточки, даже если заполнен только ИНН", async () => {
  setAccessToken("токен");
  server = startFakeApi([...commonRoutes(), { path: "/crm/customers/by-inn", response: [] }]);

  const user = userEvent.setup();
  renderLead("new");

  await user.type(await screen.findByRole("textbox", { name: "ИНН" }), "7701234567");
  await user.click(screen.getByRole("link", { name: "Лиды" }));

  expect(await screen.findByRole("dialog", { name: "Несохранённые изменения" })).toBeVisible();
});
