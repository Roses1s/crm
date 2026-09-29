import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LeadCardBody } from "@/features/crm/board/LeadCard";
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
    expect(screen.getByText("Крупный клиент")).toBeInTheDocument();
  });

  it("не показывает часики: активности убраны из CRM", () => {
    const { container } = renderWithProviders(<LeadCardBody lead={LEAD} />);
    expect(container.querySelector(".lucide-clock-3")).toBeNull();
  });
});
