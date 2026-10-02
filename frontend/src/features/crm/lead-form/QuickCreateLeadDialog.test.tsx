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

const STAGES = [{ id: 1, name: "Новый", sequence: 1, is_closed: false, color: "" }];

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
            logist_contact: null,
          },
        ],
      },
      { method: "POST", path: "/crm/leads", response: { id: 42 } },
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
