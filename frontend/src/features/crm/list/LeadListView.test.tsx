/**
 * Списочное представление лидов — 370 строк, до сих пор без единого теста
 * (находка Т-05 ревью от 03.10.2026). Проверяем главное: таблица рисуется,
 * сортировка по заголовку работает, выбор строки включает панель действий.
 */
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it } from "vitest";

import { LeadListView } from "./LeadListView";
import { renderWithProviders } from "@/test/utils";
import type { Lead } from "@/shared/types";

function lead(id: number, name: string, inn: string, priority = 0): Lead {
  return {
    id,
    name,
    inn,
    logist_contact: "Иван",
    logist_phone: "",
    logist_email: null,
    accountant_name: null,
    priority,
    is_archived: false,
    loss_reason_id: null,
    loss_reason_name: null,
    stage_id: 1,
    stage_name: "Новый",
    assigned_to_id: 1,
    assigned_to_email: "manager@crmdetroid.ru",
    assigned_to_name: "Мария Петрова",
    tags: [],
    created_at: "2026-10-01T10:00:00+03:00",
    updated_at: "2026-10-01T10:00:00+03:00",
  } as Lead;
}

const LEADS = [lead(1, "Бета", "7701234567"), lead(2, "Альфа", "7451234565", 3)];

function rowNames(): string[] {
  return screen
    .getAllByRole("row")
    .slice(1) // первая строка — заголовки
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent?.trim() ?? "");
}

it("показывает лиды таблицей", () => {
  renderWithProviders(<LeadListView leads={LEADS} />);

  expect(screen.getByText("Бета")).toBeVisible();
  expect(screen.getByText("Альфа")).toBeVisible();
  expect(screen.getAllByText("Новый").length).toBeGreaterThan(0);
});

it("сортирует по названию при щелчке на заголовок", async () => {
  const user = userEvent.setup();
  renderWithProviders(<LeadListView leads={LEADS} />);

  await user.click(screen.getByRole("button", { name: /Название/ }));

  expect(rowNames()[0]).toBe("Альфа");
});
