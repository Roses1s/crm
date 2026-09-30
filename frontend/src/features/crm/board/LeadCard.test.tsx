import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LeadCardBody } from "@/features/crm/board/LeadCard";
import { StarRating } from "@/features/crm/board/StarRating";
import { renderWithProviders } from "@/test/utils";
import type { Lead } from "@/shared/types";

const LEAD = {
  id: 1,
  name: "ООО «Уралпромснаб»",
  inn: "7451234565",
  logist_contact: "Громов Сергей",
  priority: 2,
  stage_id: 1,
  tags: [{ id: 1, name: "Крупный клиент", color: "green" }],
  assigned_to_email: "manager@crmdetroid.ru",
} as unknown as Lead;

describe("Карточка лида на канбане", () => {
  it("показывает название, ИНН, контакт и тег", () => {
    renderWithProviders(<LeadCardBody lead={LEAD} />);

    expect(
      screen.getByRole("heading", { name: /Уралпромснаб/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/7451234565/)).toBeInTheDocument();
    expect(screen.getByText("Громов Сергей")).toBeInTheDocument();
    const tag = screen.getByText("Крупный клиент");
    expect(tag).toBeInTheDocument();
    expect(tag.parentElement).toHaveClass("bg-odoo-tag-green-bg");
  });

  it("меняет приоритет по звезде без открытия карточки", async () => {
    const user = userEvent.setup();
    const onPriorityChange = vi.fn();
    renderWithProviders(
      <LeadCardBody lead={LEAD} onPriorityChange={onPriorityChange} />,
    );

    await user.click(screen.getByRole("button", { name: "Приоритет 3" }));

    expect(onPriorityChange).toHaveBeenCalledWith(3);
  });

  it("показывает предпросмотр приоритета при наведении на звезду", async () => {
    const user = userEvent.setup();
    renderWithProviders(<StarRating value={1} onChange={vi.fn()} />);

    const first = screen.getByRole("button", { name: "Приоритет 1" });
    const second = screen.getByRole("button", { name: "Приоритет 2" });
    const third = screen.getByRole("button", { name: "Приоритет 3" });
    expect(first).toHaveTextContent("★");
    expect(second).toHaveTextContent("☆");

    await user.hover(third);
    expect(first).toHaveTextContent("★");
    expect(second).toHaveTextContent("★");
    expect(third).toHaveTextContent("★");

    await user.unhover(third);
    expect(second).toHaveTextContent("☆");
    expect(third).toHaveTextContent("☆");
  });

  it("не показывает часики: активности убраны из CRM", () => {
    const { container } = renderWithProviders(<LeadCardBody lead={LEAD} />);
    expect(container.querySelector(".lucide-clock-3")).toBeNull();
  });
});
