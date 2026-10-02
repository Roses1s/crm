/**
 * HTTP-клиент.
 *
 * Все запросы идут на тот же origin, что и сайт: в проде nginx проксирует
 * /api/ в контейнер бэкенда, в разработке — dev-сервер Vite (см. vite.config.ts).
 * Поэтому никаких абсолютных адресов и переменных окружения с хостом не нужно.
 */

import { clearTokens, getAccessToken, refreshSession } from "./auth";

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

/**
 * Общий "низ" для api/apiUpload/apiBlob: добавляет Authorization, а при 401
 * один раз пробует продлить сессию по refresh-куке и повторяет запрос — чтобы
 * получасовой access-токен не выгонял человека с открытой вкладки на логин.
 * Раньше эту логику повторял только `api()`, а apiUpload/apiBlob при 401 просто
 * падали с ошибкой вместо тихого продления сессии.
 */
async function request(
  path: string,
  init: RequestInit,
  auth: boolean,
  retry = true,
): Promise<Response> {
  const token = auth ? getAccessToken() : null;

  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && auth) {
    if (retry && (await refreshSession())) {
      return request(path, init, auth, false);
    }
    clearTokens();
    if (window.location.pathname !== "/login") window.location.assign("/login");
    throw new ApiError(401, "Сессия истекла, войдите заново", "unauthorized");
  }

  return response;
}

function errorDetail(payload: unknown, fallbackStatus: number): string {
  return (
    (payload && typeof payload === "object" && "detail" in payload
      ? String((payload as { detail: unknown }).detail)
      : null) ?? `Ошибка ${fallbackStatus}`
  );
}

function errorCode(payload: unknown): string | undefined {
  return payload && typeof payload === "object" && "code" in payload
    ? String((payload as { code: unknown }).code)
    : undefined;
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean };

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const response = await request(
    path,
    {
      ...rest,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    },
    auth,
  );

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, errorDetail(payload, response.status), errorCode(payload));
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

/** Загрузка файла: FormData, Content-Type браузер выставит сам (с boundary). */
export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  const response = await request(path, { method: "POST", body: form }, true);

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, errorDetail(payload, response.status), errorCode(payload));
  }
  return payload as T;
}

/** Файл приходит из закрытой ручки, поэтому его нельзя вставить в <img src>:
 *  сначала скачиваем с токеном, потом показываем из памяти. */
export async function apiBlob(path: string): Promise<Blob> {
  const response = await request(path, {}, true);
  if (!response.ok) throw new ApiError(response.status, "Не удалось получить файл");
  return response.blob();
}
