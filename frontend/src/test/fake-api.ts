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

export interface FakeRoute {
  /** Метод запроса; по умолчанию GET. */
  method?: string;
  /** Начало адреса без префикса /api/v1, например "/crm/leads". */
  path: string;
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

    const route = routes.find(
      (candidate) =>
        (candidate.method ?? "GET").toUpperCase() === method &&
        url.startsWith(`/api/v1${candidate.path}`),
    );

    if (!route) {
      return jsonResponse({ detail: `Нет поддельного маршрута: ${method} ${url}` }, 404);
    }

    const payload =
      typeof route.response === "function"
        ? (route.response as (requestBody: unknown) => unknown)(body)
        : route.response;

    return jsonResponse(payload, route.status ?? 200);
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
export function page<T>(items: T[]): { results: T[]; count: number } {
  return { results: items, count: items.length };
}
