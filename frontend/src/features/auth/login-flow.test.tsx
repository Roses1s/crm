/**
 * Сценарий «человек входит в систему».
 *
 * В отличие от LoginPage.test.tsx здесь ничего не подменяется кроме сети:
 * работают настоящие хуки и настоящий HTTP-клиент. Проверяется весь путь —
 * ввод, отправка запроса, сохранение токена, ошибка при неверном пароле.
 */

import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { LoginPage } from "@/features/auth/LoginPage";
import { clearTokens, getAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

describe("Сценарий: вход в систему", () => {
  it("верные данные -> запрос на сервер и сохранённый токен", async () => {
    server = startFakeApi([
      {
        method: "POST",
        path: "/auth/login",
        response: { access_token: "токен-123", token_type: "bearer", expires_in: 1800 },
      },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByPlaceholderText("name@crmdetroid.ru"), "admin@crmdetroid.ru");
    await user.type(screen.getByPlaceholderText("••••••••"), "Secret123");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    await waitFor(() => expect(getAccessToken()).toBe("токен-123"));

    const login = server.calls.find((call) => call.url.includes("/auth/login"));
    expect(login?.method).toBe("POST");
    expect(login?.body).toEqual({ email: "admin@crmdetroid.ru", password: "Secret123" });
  });

  it("неверный пароль -> сообщение об ошибке и никакого токена", async () => {
    server = startFakeApi([
      {
        method: "POST",
        path: "/auth/login",
        status: 401,
        response: { detail: "Неверный email или пароль" },
      },
    ]);

    const user = userEvent.setup();
    renderWithProviders(<LoginPage />);

    await user.type(screen.getByPlaceholderText("name@crmdetroid.ru"), "admin@crmdetroid.ru");
    await user.type(screen.getByPlaceholderText("••••••••"), "неверный");
    await user.click(screen.getByRole("button", { name: "Войти" }));

    expect(await screen.findByText(/Неверный email или пароль/)).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });
});
