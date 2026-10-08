import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/features/auth/LoginPage";
import { renderWithProviders } from "@/test/utils";

// Вход ходит на сервер — в тесте подменяем сетевой слой.
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("@/shared/api/hooks", () => ({
  useLogin: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock("@/shared/api/auth", () => ({ useIsAuthenticated: () => false }));

describe("Страница входа", () => {
  it("показывает название компании и поля", () => {
    renderWithProviders(<LoginPage />);

    expect(screen.getByRole("heading", { name: "CRM Детроид" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("name@crmdetroid.ru")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Войти" })).toBeInTheDocument();
  });

  it("отправляет введённые данные на сервер", async () => {
    mocks.mutate.mockClear();
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByPlaceholderText("name@crmdetroid.ru"), "admin@crmdetroid.ru");
    await user.type(screen.getByPlaceholderText("••••••••"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(mocks.mutate).toHaveBeenCalledWith(
      { email: "admin@crmdetroid.ru", password: "Secret123" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("показывает и скрывает пароль по кнопке-глазу", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    const password = screen.getByPlaceholderText("••••••••");
    expect(password).toHaveAttribute("type", "password");

    await user.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(password).toHaveAttribute("type", "text");

    await user.click(screen.getByRole("button", { name: "Скрыть пароль" }));
    expect(password).toHaveAttribute("type", "password");
  });
});
