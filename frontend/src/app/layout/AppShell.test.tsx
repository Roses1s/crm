import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ControlPanel } from "@/app/layout/AppShell";
import { renderWithProviders } from "@/test/utils";

describe("панель управления", () => {
  it("держит поиск нейтральным до получения фокуса", () => {
    renderWithProviders(<ControlPanel onSearch={vi.fn()} />);

    const search = screen.getByRole("textbox", { name: "Поиск" });
    const frame = search.parentElement;

    expect(frame).toHaveClass("border-odoo-border");
    expect(frame).toHaveClass("focus-within:border-odoo-accent-line/70");
    expect(frame).toHaveClass("focus-within:ring-odoo-accent-line/20");
  });
});
