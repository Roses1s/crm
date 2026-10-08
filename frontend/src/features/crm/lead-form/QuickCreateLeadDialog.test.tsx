/**
 * Быстрое создание лида: обязательные поля и предупреждение о дубле ИНН.
 *
 * Предупреждение не должно блокировать отправку — это проверяется отдельно
 * (кнопка «Создать» остаётся кликабельной, запрос на создание всё равно уходит).
 */
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { QuickCreateLeadDialog } from "./QuickCreateLeadDialog";
import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

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
});
