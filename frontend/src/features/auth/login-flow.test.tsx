/**
 * Сценарий входа через настоящий хук, HTTP-клиент и поддельную сеть.
 * Проверяем отправленные данные, сохранение токена и обработку отказа сервера.
 */

import { act } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { useLogin } from "@/shared/api/hooks";
import { clearTokens, getAccessToken } from "@/shared/api/auth";
import { startFakeApi, type FakeServer } from "@/test/fake-api";
import { renderWithProviders } from "@/test/utils";

let server: FakeServer | undefined;
let loginMutation: ReturnType<typeof useLogin> | undefined;

function LoginMutationProbe() {
  loginMutation = useLogin();
  return null;
}

afterEach(() => {
  server?.restore();
  server = undefined;
  loginMutation = undefined;
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

    renderWithProviders(<LoginMutationProbe />);
    const mutation = loginMutation;
    if (!mutation) throw new Error("Хук входа не создался");

    await act(async () => {
      await mutation.mutateAsync({
        email: "admin@crmdetroid.ru",
        password: "Secret123",
      });
    });

    expect(getAccessToken()).toBe("токен-123");
    const login = server.calls.find((call) => call.url.includes("/auth/login"));
    expect(login?.method).toBe("POST");
    expect(login?.body).toEqual({ email: "admin@crmdetroid.ru", password: "Secret123" });
  });

  it("неверный пароль -> ошибка сервера и никакого токена", async () => {
    server = startFakeApi([
      {
        method: "POST",
        path: "/auth/login",
        status: 401,
        response: { detail: "Неверный email или пароль" },
      },
    ]);

    renderWithProviders(<LoginMutationProbe />);
    const mutation = loginMutation;
    if (!mutation) throw new Error("Хук входа не создался");

    await expect(
      act(async () => {
        await mutation.mutateAsync({ email: "admin@crmdetroid.ru", password: "неверный" });
      }),
    ).rejects.toMatchObject({ status: 401 });
    expect(getAccessToken()).toBeNull();
  });
});
