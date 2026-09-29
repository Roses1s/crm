import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { BoardBanner, BoardSuggestions } from "@/features/crm/board/BoardSwitcher";
import { renderWithProviders } from "@/test/utils";

const USERS = [
  {
    id: 2,
    email: "kuznetsov@crmdetroid.ru",
    first_name: "Денис",
    last_name: "Кузнецов",
    role: "manager",
    is_active: true,
  },
  {
    id: 3,
    email: "petrova@crmdetroid.ru",
    first_name: "Ольга",
    last_name: "Петрова",
    role: "manager",
    is_active: true,
  },
];

vi.mock("@/shared/api/hooks", () => ({ useUsers: () => ({ data: USERS }) }));

describe("Доски сотрудников", () => {
  it("молчит, пока в поиске меньше двух букв", () => {
    renderWithProviders(<BoardSuggestions query="К" boardUserId={null} onPick={vi.fn()} />);
    expect(screen.queryByText("Сотрудники")).not.toBeInTheDocument();
  });

  it("предлагает сотрудника по фамилии и отдаёт его номер", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    renderWithProviders(<BoardSuggestions query="кузн" boardUserId={null} onPick={onPick} />);

    expect(screen.queryByText("Петрова Ольга")).not.toBeInTheDocument();
    await user.click(screen.getByText("Кузнецов Денис"));
    expect(onPick).toHaveBeenCalledWith(2);
  });

  it("плашка показывает, чья доска открыта, и даёт вернуться", async () => {
    const user = userEvent.setup();
    const onLeave = vi.fn();
    renderWithProviders(<BoardBanner boardUserId={2} onLeave={onLeave} />);

    expect(screen.getByText(/Доска сотрудника: Кузнецов Денис/)).toBeInTheDocument();
    await user.click(screen.getByText(/вернуться к своей/));
    expect(onLeave).toHaveBeenCalled();
  });
});
