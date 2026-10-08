import { useMutation, useQuery } from "@tanstack/react-query";

import type { User } from "@/shared/types";
import { clearTokens, startSession } from "../auth";
import { api } from "../client";
import { accessTokenResponseSchema, userSchema } from "../schemas";
import type { AccessTokenResponse } from "../schemas";
import { keys } from "./shared";

// --- авторизация -------------------------------------------------------------
export function useLogin() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<AccessTokenResponse>("/auth/login", {
        method: "POST",
        body: credentials,
        auth: false,
        schema: accessTokenResponseSchema,
      }),
    // Обновляющий токен сервер кладёт в куку сам, нам приходит только короткий.
    // Новая учётная запись всегда начинает с пустого Query cache.
    onSuccess: (data) => startSession(data.access_token),
  });
}

export function logout(): void {
  // Данные прежнего сотрудника скрываем синхронно, не дожидаясь сети. Куку
  // может стереть только сервер — она недоступна скриптам.
  clearTokens();
  void fetch("/api/v1/auth/logout", { method: "POST" });
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<User>("/auth/me", { schema: userSchema }),
    staleTime: 5 * 60_000,
    retry: false,
  });
}
