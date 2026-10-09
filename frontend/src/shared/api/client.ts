/**
 * HTTP-клиент.
 *
 * Все запросы идут на тот же origin, что и сайт: в проде nginx проксирует
 * /api/ в контейнер бэкенда, в разработке — dev-сервер Vite (см. vite.config.ts).
 * Поэтому никаких абсолютных адресов и переменных окружения с хостом не нужно.
 */

import type { ZodType } from "zod";

import { clearTokens, getAccessToken, getSessionGeneration, refreshSession } from "./auth";

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

export interface ApiResponseIssue {
  path: string;
  message: string;
}

/** Сервер ответил успешно, но вернул данные не того формата, которого ждёт приложение. */
export class ApiResponseError extends ApiError {
  constructor(
    readonly endpoint: string,
    readonly issues: ApiResponseIssue[],
  ) {
    super(
      502,
      `Ответ сервера не соответствует ожидаемому формату (${endpoint})`,
      "invalid_response",
    );
    this.name = "ApiResponseError";
  }
}

/**
 * Общий "низ" для api/apiUpload/apiBlob: добавляет Authorization, а при 401
 * один раз пробует продлить сессию по refresh-куке и повторяет запрос — чтобы
 * получасовой access-токен не выгонял человека с открытой вкладки на логин.
 */
async function request(
  path: string,
  init: RequestInit,
  auth: boolean,
  retry = true,
): Promise<Response> {
  const token = auth ? getAccessToken() : null;
  const generationAtStart = getSessionGeneration();

  const response = await fetch(`${BASE}${path}`, {
    // Браузерный кеш отключён: за актуальность данных отвечают React Query
    // на клиенте и fastapi-cache на сервере.
    cache: "no-store",
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (response.status === 401 && auth) {
    // Не обновляем сессию и не повторяем старый запрос токеном другого пользователя.
    if (generationAtStart !== getSessionGeneration()) {
      throw new ApiError(401, "Запрос относится к предыдущей сессии", "session_changed");
    }
    if (retry && (await refreshSession())) {
      if (generationAtStart !== getSessionGeneration()) {
        throw new ApiError(401, "Запрос относится к предыдущей сессии", "session_changed");
      }
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

type Options<T> = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
  schema: ZodType<T>;
};

function validateResponse<T>(
  path: string,
  method: string,
  schema: ZodType<T>,
  payload: unknown,
): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const endpoint = `${method.toUpperCase()} ${path.split("?", 1)[0]}`;
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join(".") || "$",
      message: issue.message,
    }));
    throw new ApiResponseError(endpoint, issues);
  }
  return result.data;
}

/** Успешный JSON разбирается по схеме, а не приводится к типу без проверки. */
export async function api<T>(path: string, options: Options<T>): Promise<T> {
  const { body, auth = true, headers, schema, ...rest } = options;

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

  const method = String(rest.method ?? "GET");
  if (response.status === 204) return validateResponse(path, method, schema, undefined);

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status, errorDetail(payload, response.status), errorCode(payload));
  }

  return validateResponse(path, method, schema, payload);
}

/** Ответ списочных ручек бэкенда. */
export interface Page<T> {
  count: number;
  next: number | null;
  previous: number | null;
  results: T[];
}

/** Загрузка файла: FormData, Content-Type браузер выставит сам (с boundary). */
export async function apiUpload<T>(path: string, file: File, schema: ZodType<T>): Promise<T> {
  const form = new FormData();
  form.append("file", file);

  const response = await request(path, { method: "POST", body: form }, true);

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, errorDetail(payload, response.status), errorCode(payload));
  }
  return validateResponse(path, "POST", schema, payload);
}

/** Файл приходит из закрытой ручки, поэтому его нельзя вставить в <img src>:
 *  сначала скачиваем с токеном, потом показываем из памяти. */
export async function apiBlob(path: string, signal?: AbortSignal): Promise<Blob> {
  const response = await request(path, signal ? { signal } : {}, true);
  if (!response.ok) throw new ApiError(response.status, "Не удалось получить файл");
  return response.blob();
}
