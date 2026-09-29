/**
 * HTTP-клиент.
 *
 * Все запросы идут на тот же origin, что и сайт: в проде nginx проксирует
 * /api/ в контейнер бэкенда, в разработке — dev-сервер Vite (см. vite.config.ts).
 * Поэтому никаких абсолютных адресов и переменных окружения с хостом не нужно.
 */

import { clearTokens, getAccessToken } from "./auth";

const BASE = "/api/v1";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;
  const token = auth ? getAccessToken() : null;

  const response = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401 && auth) {
    // Токен протух или отозван — выходим и уводим на страницу входа.
    clearTokens();
    if (window.location.pathname !== "/login") window.location.assign("/login");
    throw new ApiError(401, "Сессия истекла, войдите заново", "unauthorized");
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      (payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail: unknown }).detail)
        : null) ?? `Ошибка ${response.status}`;
    const code =
      payload && typeof payload === "object" && "code" in payload
        ? String((payload as { code: unknown }).code)
        : undefined;
    throw new ApiError(response.status, detail, code);
  }

  return payload as T;
}

/** Ответ списочных ручек бэкенда. */
export interface Page<T> {
  count: number;
  next: number | null;
  previous: number | null;
  results: T[];
}
