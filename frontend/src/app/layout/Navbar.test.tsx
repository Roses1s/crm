import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLocation } from "react-router-dom";

import { Navbar } from "@/app/layout/Navbar";
import { renderWithProviders } from "@/test/utils";

const mockedUser = vi.hoisted(() => ({
  data: {
    id: 1,
    email: "ivanov@crmdetroid.ru",
    first_name: "Иван",
    last_name: "Иванов",
    role: "manager" as "manager" | "admin",
    is_active: true,
  },
}));

vi.mock("@/shared/api/hooks", () => ({
  logout: vi.fn(),
  useMe: () => ({ data: mockedUser.data }),
}));

vi.mock("@/shared/lib/theme", () => ({
  toggleTheme: vi.fn(),
  useTheme: () => "dark",
}));

afterEach(() => {
  mockedUser.data.role = "manager";
});

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

describe("меню профиля", () => {
  it("показывает ФИО и закрывается повторным кликом, снаружи и по Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Navbar />);

    expect(screen.getByText("Иванов Иван")).toBeInTheDocument();
    const avatar = screen.getByRole("button", { name: "Меню профиля" });

    await user.click(avatar);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Панель управления" })).not.toBeInTheDocument();

    await user.click(avatar);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(avatar);
    await user.click(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    await user.click(avatar);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("показывает ссылку панели администратору и переводит на /admin", async () => {
    mockedUser.data.role = "admin";
    const user = userEvent.setup();
    renderWithProviders(
      <>
        <Navbar />
        <CurrentPath />
      </>,
      { route: "/crm" },
    );

    await user.click(screen.getByRole("button", { name: "Меню профиля" }));
    await user.click(screen.getByRole("button", { name: "Панель управления" }));

    expect(screen.getByTestId("current-path")).toHaveTextContent("/admin");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("закрывает мобильное меню отдельной кнопкой-фоном", async () => {
    const user = userEvent.setup();
    renderWithProviders(<Navbar />);

    await user.click(screen.getByRole("button", { name: "Меню" }));
    expect(screen.getByRole("dialog", { name: "Навигационное меню" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Закрыть меню нажатием на фон" }));
    expect(screen.queryByRole("dialog", { name: "Навигационное меню" })).not.toBeInTheDocument();
  });
});
