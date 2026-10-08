/**
 * Поддельный сервер для сценарных тестов.
 *
 * Обычные тесты подменяют хуки (`vi.mock("@/shared/api/hooks")`) и проверяют
 * только разметку. Здесь другой подход: подменяется САМА сеть (`fetch`), а
 * приложение работает по-настоящему — настоящие хуки, настоящий HTTP-клиент,
 * настоящий кеш запросов. Так проверяется весь путь «клик -> запрос -> ответ ->
 * обновление экрана», то есть почти то же, что проверял бы живой человек.
 *
 * Настоящий браузер (Playwright) в этой среде недоступен — браузеры не
 * скачиваются, — поэтому страницы отрисовываются в jsdom.
 */

import { vi } from "vitest";

interface FakeRoute {
  /** Метод запроса; по умолчанию GET. */
  method?: string;
  /** Начало адреса без префикса /api/v1, например "/crm/leads". */
  path: string;
  /** Необязательные параметры адреса, например { stage: "2", page: "2" }. */
  query?: Record<string, string>;
  /** Ответ: готовый объект или функция от тела запроса. */
  response: unknown | ((body: unknown) => unknown);
  /** Код ответа; по умолчанию 200. */
  status?: number;
}

export interface FakeServer {
  /** Все выполненные запросы — удобно проверять, что ушло на сервер. */
  calls: { method: string; url: string; body: unknown }[];
  /** Был ли такой запрос. */
  called(method: string, path: string): boolean;
  restore(): void;
}

/**
 * Включает поддельный сервер на время теста.
 *
 * Неописанные адреса возвращают 404 с понятным текстом — так забытый маршрут
 * сразу видно в сообщении об ошибке, а не в виде «вечной загрузки».
 */
export function startFakeApi(routes: FakeRoute[]): FakeServer {
  const calls: FakeServer["calls"] = [];

  const handler = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? safeParse(String(init.body)) : undefined;
    calls.push({ method, url, body });

    const requestUrl = new URL(url, "http://fake-api.local");
    const route = routes.find(
      (candidate) =>
        (candidate.method ?? "GET").toUpperCase() === method &&
        requestUrl.pathname.startsWith(`/api/v1${candidate.path}`) &&
        Object.entries(candidate.query ?? {}).every(
          ([key, value]) => requestUrl.searchParams.get(key) === value,
        ),
    );

    if (!route) {
      return jsonResponse({ detail: `Нет поддельного маршрута: ${method} ${url}` }, 404);
    }

    const payload =
      typeof route.response === "function"
        ? (route.response as (requestBody: unknown) => unknown)(body)
        : route.response;

    const status = route.status ?? (payload === null ? 204 : 200);
    return status === 204 ? new Response(null, { status }) : jsonResponse(payload, status);
  });

  vi.stubGlobal("fetch", handler);

  return {
    calls,
    called: (method, path) =>
      calls.some(
        (call) => call.method === method.toUpperCase() && call.url.startsWith(`/api/v1${path}`),
      ),
    restore: () => vi.unstubAllGlobals(),
  };
}

function jsonResponse(payload: unknown, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function safeParse(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Страница списка в формате пагинации бэкенда. */
export function page<T>(items: T[]): {
  results: T[];
  count: number;
  next: number | null;
  previous: number | null;
} {
  return { results: items, count: items.length, next: null, previous: null };
}
