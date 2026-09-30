import { fireEvent, screen } from "@testing-library/react";
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

  it("использует единые токены геометрии для редактора и ленты", () => {
    renderWithProviders(<Chatter timeline={TIMELINE} authorInitials="М" />);

    expect(screen.getByTitle("Вы")).toHaveClass(
      "h-[var(--odoo-chatter-avatar-size)]",
      "w-[var(--odoo-chatter-avatar-size)]",
    );
    for (const avatar of screen.getAllByText("МИ")) {
      expect(avatar).toHaveClass(
        "h-[var(--odoo-chatter-avatar-size)]",
        "w-[var(--odoo-chatter-avatar-size)]",
      );
    }

    const submitRow = screen.getByRole("button", { name: "Лог" }).parentElement;
    expect(submitRow).toHaveStyle(
      "margin-inline-start: var(--odoo-chatter-composer-indent)",
    );
    expect(screen.getByRole("textbox", { name: "Текст внутреннего примечания" }).closest("form")).toHaveStyle(
      "padding-inline: var(--odoo-chatter-panel-padding)",
    );

    const date = screen.getByText("30 сентября 2026 г.");
    expect(date.previousElementSibling).toHaveClass("bg-odoo-chatter-divider");
    expect(date.nextElementSibling).toHaveClass("bg-odoo-chatter-divider");
  });

  it("автоматически увеличивает редактор и не показывает внутреннюю прокрутку", () => {
    renderWithProviders(<Chatter timeline={[]} authorInitials="М" />);
    const editor = screen.getByRole("textbox", { name: "Текст внутреннего примечания" });
    Object.defineProperty(editor, "scrollHeight", { configurable: true, value: 138 });

    fireEvent.change(editor, { target: { value: "Длинная внутренняя запись" } });

    expect(editor).toHaveStyle({ height: "138px" });
    expect(editor).toHaveClass("resize-none", "overflow-hidden");
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
