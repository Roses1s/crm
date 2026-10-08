import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CustomerTile } from "@/features/customers/CustomerTile";
import { renderWithProviders } from "@/test/utils";
import type { Customer } from "@/shared/types";

const OPEN_CUSTOMER: Customer = {
  id: 1,
  name: "ООО «Уралпромснаб»",
  inn: "7451234565",
  assigned_to_id: 2,
  assigned_to_name: "Денис Кузнецов",
  is_archived: false,
  can_open: true,
  loss_reason_name: null,
  logist_contact: "Громов Сергей",
  logist_phone: "",
  logist_email: null,
  priority: 2,
  stage_name: "Переговоры",
  tags: [{ id: 1, name: "Крупный клиент", color: "#1e8449" }],
  updated_at: "2026-10-01T00:00:00Z",
};

const MASKED_CUSTOMER: Customer = {
  id: 2,
  name: "ООО «Ромашка»",
  inn: "7700000000",
  assigned_to_id: 3,
  assigned_to_name: "Ирина Орлова",
  is_archived: false,
  can_open: false,
  loss_reason_name: null,
  logist_contact: null,
  logist_phone: null,
  logist_email: null,
  priority: null,
  stage_name: null,
  tags: [],
  updated_at: "2026-10-01T00:00:00Z",
};

const LOST_CUSTOMER: Customer = {
  ...OPEN_CUSTOMER,
  id: 3,
  is_archived: true,
  can_open: true,
  loss_reason_name: "Отказ СБ",
};

describe("Плитка клиента", () => {
  it("свой лид открыт полностью и ведёт на карточку", () => {
    renderWithProviders(<CustomerTile customer={OPEN_CUSTOMER} />);

    expect(screen.getByText(/Уралпромснаб/)).toBeInTheDocument();
    expect(screen.getByText(/7451234565/)).toBeInTheDocument();
    expect(screen.getByText("Денис Кузнецов")).toBeInTheDocument();
    expect(screen.getByText("Крупный клиент")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/crm/leads/1");
  });

  it("чужой активный лид показывает только название, ИНН и продавца — без ссылки", () => {
    renderWithProviders(<CustomerTile customer={MASKED_CUSTOMER} />);

    expect(screen.getByText(/Ромашка/)).toBeInTheDocument();
    expect(screen.getByText(/7700000000/)).toBeInTheDocument();
    expect(screen.getByText("Ирина Орлова")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("проигранный чужой лид открыт полностью и помечен плашкой «Проигрыш»", () => {
    renderWithProviders(<CustomerTile customer={LOST_CUSTOMER} />);

    expect(screen.getByText("Проигрыш")).toBeInTheDocument();
    expect(screen.getByText("Отказ СБ")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/crm/leads/3");
  });
});
