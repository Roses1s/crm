import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Chatter } from "@/shared/ui/chatter";
import { renderWithProviders } from "@/test/utils";
import type { TimelineEntry } from "@/shared/types";

const TIMELINE: TimelineEntry[] = [
  {
    id: 2,
    type: "note",
    author_name: "Мария Иванова",
    author_initials: "МИ",
    body: "Договорились перезвонить завтра.\nЖдём ответ логиста.",
    created_at: "2026-09-30T12:00:00+05:00",
  },
  {
    id: 1,
    type: "history",
    author_name: "Мария Иванова",
    author_initials: "МИ",
    body: "",
    field_label: "Этапы лидов",
    old_value: "Новый",
    new_value: "Перезвонить",
    created_at: "2026-09-30T11:30:00+05:00",
  },
];

describe("Лента примечаний", () => {
  it("показывает только внутренние примечания и историю в формате Odoo", () => {
    renderWithProviders(<Chatter timeline={TIMELINE} authorInitials="М" />);

    expect(screen.getByRole("button", { name: "Лог примечания" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Отправить сообщение/i })).toBeNull();
    expect(screen.queryByText("Активность")).toBeNull();
    expect(screen.getByText("30 сентября 2026 г.")).toBeInTheDocument();
    expect(
      screen.getByText(/Договорились перезвонить завтра\.\s+Ждём ответ логиста\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/\(Этапы лидов\)/)).toBeInTheDocument();
    expect(screen.getByText("Новый")).toBeInTheDocument();
    expect(screen.getByText("Перезвонить")).toBeInTheDocument();
  });

  it("передаёт новую внутреннюю запись в обработчик", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(<Chatter timeline={[]} onSubmit={onSubmit} authorInitials="М" />);

    await user.type(
      screen.getByRole("textbox", { name: "Текст внутреннего примечания" }),
      "Уточнить ставку у перевозчика",
    );
    await user.click(screen.getByRole("button", { name: "Лог" }));

    expect(onSubmit).toHaveBeenCalledWith("Уточнить ставку у перевозчика", []);
  });
});
