import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Navbar } from "@/app/layout/Navbar";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/shared/api/hooks", () => ({
  logout: vi.fn(),
  useMe: () => ({
    data: {
      id: 1,
      email: "ivanov@crmdetroid.ru",
      first_name: "Иван",
      last_name: "Иванов",
      role: "manager",
      is_active: true,
    },
  }),
}));

vi.mock("@/shared/lib/theme", () => ({
  toggleTheme: vi.fn(),
  useTheme: () => "dark",
}));

describe("меню профиля", () => {
  it("показывает ФИО и закрывается повторным кликом, снаружи и по Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Navbar />);

    expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    const avatar = screen.getByRole("button", { name: "Меню профиля" });

    await user.click(avatar);
    expect(screen.getByRole("menu")).toBeInTheDocument();

    await user.click(avatar);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(avatar);
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(avatar);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
