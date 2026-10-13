import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import { LeadFormPage } from "@/features/crm/LeadFormPage";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { ToastProvider } from "@/shared/ui/toast";
import { renderWithDataRouter } from "@/test/utils";
import type { Attachment, TimelineEntry } from "@/shared/types";

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
  logist_phone: "+7 900 000-00-00",
  logist_email: null,
  accountant_name: null,
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

const CREATED_NOTE: TimelineEntry = {
  id: 42,
  type: "note",
  body: "Уточнить ставку у перевозчика",
  field_label: null,
  old_value: null,
  new_value: null,
  is_stage_change: false,
  attachments: [],
  created_at: "2026-10-13T10:00:00+03:00",
  author_name: "Админов Админ",
  author_initials: "А",
  author_id: 1,
};

const ATTACHMENT: Attachment = {
  id: 90,
  name: "stavka.pdf",
  size: 4,
  content_type: "application/pdf",
  uploaded_by_name: "Админов Админ",
  created_at: "2026-10-13T10:00:00+03:00",
};

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

function leadRoutes(attachments: Attachment[] = []) {
  return [
    { path: "/auth/me", response: ME },
    { path: "/crm/leads/10/timeline", response: [] },
    {
      path: "/crm/leads/10/pager",
      response: { position: 1, total: 1, prev_id: null, next_id: null },
    },
    { path: "/crm/leads/10/attachments", response: attachments },
    { path: "/crm/leads/10", response: LEAD },
    { path: "/crm/stages", response: STAGES },
    { path: "/crm/tags", response: [] },
    { path: "/crm/customers/by-inn", response: [] },
    { path: "/leads/10/shipments", response: [] },
  ];
}

function renderLead() {
  return renderWithDataRouter(
    <ToastProvider>
      <Routes>
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
        <Route path="/crm" element={<p>Доска CRM</p>} />
      </Routes>
    </ToastProvider>,
    { route: "/crm/leads/10" },
  );
}

function writes() {
  return (server?.calls ?? []).filter((call) => call.method !== "GET");
}

it("сначала создаёт запись ленты, затем привязывает выбранный файл к её id", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { method: "POST", path: "/crm/leads/10/notes", response: CREATED_NOTE },
    {
      method: "POST",
      path: "/crm/leads/10/attachments",
      query: { entry_id: "42" },
      response: ATTACHMENT,
    },
  ]);

  const user = userEvent.setup();
  renderLead();

  await screen.findByRole("textbox", { name: "Текст внутреннего примечания" });
  await user.type(
    screen.getByRole("textbox", { name: "Текст внутреннего примечания" }),
    "Уточнить ставку у перевозчика",
  );
  await user.upload(screen.getByLabelText("Файлы записи"), [
    new File(["счёт"], "stavka.pdf", { type: "application/pdf" }),
    new File(["приложение"], "details.pdf", { type: "application/pdf" }),
  ]);
  await user.click(screen.getByRole("button", { name: "Лог" }));

  await waitFor(() => expect(writes()).toHaveLength(3));
  const [note, ...attachments] = writes();
  expect(note.url).toContain("/crm/leads/10/notes");
  expect(note.body).toEqual({ body: "Уточнить ставку у перевозчика" });
  expect(attachments).toHaveLength(2);
  for (const attachment of attachments) {
    expect(attachment.url).toContain("/crm/leads/10/attachments?entry_id=42");
  }
});

it("создаёт запись «Вложение», если отправлен только файл", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { method: "POST", path: "/crm/leads/10/notes", response: CREATED_NOTE },
    {
      method: "POST",
      path: "/crm/leads/10/attachments",
      query: { entry_id: "42" },
      response: ATTACHMENT,
    },
  ]);

  const user = userEvent.setup();
  renderLead();

  await user.upload(
    await screen.findByLabelText("Файлы записи"),
    new File(["счёт"], "stavka.pdf", { type: "application/pdf" }),
  );
  await user.click(screen.getByRole("button", { name: "Лог" }));

  await waitFor(() => expect(writes()).toHaveLength(2));
  expect(writes()[0].body).toEqual({ body: "Вложение" });
  expect(writes()[1].url).toContain("/crm/leads/10/attachments?entry_id=42");
});

it("загрузка из общей панели отправляет вложение без entry_id", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes(),
    { method: "POST", path: "/crm/leads/10/attachments", response: ATTACHMENT },
  ]);

  const user = userEvent.setup();
  const { container } = renderLead();
  await screen.findByRole("button", { name: "Вложения: 0" });
  await user.click(screen.getByRole("button", { name: "Вложения: 0" }));
  const fileInput = container.querySelector('input[type="file"]');
  expect(fileInput).not.toBeNull();
  await user.upload(
    fileInput as HTMLInputElement,
    new File(["счёт"], "stavka.pdf", { type: "application/pdf" }),
  );

  await waitFor(() => expect(writes()).toHaveLength(1));
  expect(writes()[0].url).toContain("/crm/leads/10/attachments");
  expect(new URL(writes()[0].url, "http://fake-api.local").searchParams.has("entry_id")).toBe(
    false,
  );
});

it("удаляет вложение через общую ручку после подтверждения", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    ...leadRoutes([ATTACHMENT]),
    { method: "DELETE", path: "/crm/attachments/90", response: null },
  ]);
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

  const user = userEvent.setup();
  renderLead();
  await user.click(await screen.findByRole("button", { name: "Вложения: 1" }));
  await user.click(screen.getByRole("button", { name: "Удалить stavka.pdf" }));

  await waitFor(() => expect(server?.called("DELETE", "/crm/attachments/90")).toBe(true));
  expect(confirm).toHaveBeenCalledWith("Удалить вложение «stavka.pdf»?");
});
