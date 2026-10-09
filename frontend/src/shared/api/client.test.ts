/**
 * Раньше при 401 только `api()` тихо продлевал сессию через refresh-куку и
 * повторял запрос; `apiUpload`/`apiBlob` при той же ситуации сразу падали с
 * ошибкой — человека выкидывало на логин посреди загрузки файла. Теперь все
 * три идут через общий `request()`, и это поведение проверяем здесь.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  clearTokens,
  getAccessToken,
  setAccessToken,
  startSession,
} from "@/shared/api/auth";
import { api, apiBlob, apiUpload, ApiError, ApiResponseError } from "@/shared/api/client";

afterEach(() => {
  vi.unstubAllGlobals();
  clearTokens();
});

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("401 посреди запроса -> тихий refresh и один повтор", () => {
  it("apiBlob повторяет запрос после успешного продления сессии", async () => {
    setAccessToken("stale-token");
    let attempt = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse({
          access_token: "fresh-token",
          token_type: "bearer",
          expires_in: 1800,
        });
      }
      attempt += 1;
      return attempt === 1 ? jsonResponse({ detail: "expired" }, 401) : new Response("binary-data");
    });
    vi.stubGlobal("fetch", fetchMock);

    const blob = await apiBlob("/attachments/1/file");

    expect(await blob.text()).toBe("binary-data");
    // неудачная попытка + refresh + удачный повтор = 3 запроса
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("apiUpload повторяет запрос после успешного продления сессии", async () => {
    setAccessToken("stale-token");
    let attempt = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse({
          access_token: "fresh-token",
          token_type: "bearer",
          expires_in: 1800,
        });
      }
      attempt += 1;
      return attempt === 1 ? jsonResponse({ detail: "expired" }, 401) : jsonResponse({ id: 7 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const file = new File(["содержимое"], "doc.pdf", { type: "application/pdf" });
    const result = await apiUpload<{ id: number }>(
      "/attachments",
      file,
      z.object({ id: z.number() }),
    );

    expect(result).toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("если refresh тоже не удался, apiBlob/apiUpload честно падают с 401", async () => {
    setAccessToken("stale-token");

    // jsdom не умеет переходить на другую страницу: подменяем только эту
    // возможность браузера и проверяем, что клиент просит открыть /login.
    const location = { pathname: "/", assign: vi.fn() };
    vi.stubGlobal("window", { location });

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return jsonResponse({ detail: "no session" }, 401);
      return jsonResponse({ detail: "expired" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiBlob("/attachments/1/file")).rejects.toBeInstanceOf(ApiError);
    expect(location.assign).toHaveBeenCalledWith("/login");
  });

  it("api() сохраняет прежнее поведение (контрольный пример)", async () => {
    setAccessToken("stale-token");
    let attempt = 0;

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        return jsonResponse({
          access_token: "fresh-token",
          token_type: "bearer",
          expires_in: 1800,
        });
      }
      attempt += 1;
      return attempt === 1 ? jsonResponse({ detail: "expired" }, 401) : jsonResponse({ ok: true });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await api<{ ok: boolean }>("/crm/leads/1", {
      schema: z.object({ ok: z.boolean() }),
    });

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

it("не очищает новую сессию, если старый refresh завершается ошибкой", async () => {
  setAccessToken("token-user-a");
  let resolveRefresh!: (response: Response) => void;
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    }
    return Promise.resolve(jsonResponse({ detail: "expired" }, 401));
  });
  vi.stubGlobal("fetch", fetchMock);

  const pending = api("/crm/leads/1", { schema: z.object({ ok: z.boolean() }) });
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  startSession("token-user-b");
  resolveRefresh(jsonResponse({ detail: "refresh expired" }, 401));

  await expect(pending).rejects.toMatchObject({ status: 401, code: "session_changed" });
  expect(getAccessToken()).toBe("token-user-b");
});

it("не возвращает успешный ответ от предыдущей сессии", async () => {
  setAccessToken("token-user-a");
  let resolveOldResponse!: (response: Response) => void;
  const oldResponse = new Promise<Response>((resolve) => {
    resolveOldResponse = resolve;
  });
  const fetchMock = vi.fn(() => oldResponse);
  vi.stubGlobal("fetch", fetchMock);

  const pending = api("/crm/leads/1", { schema: z.object({ ok: z.boolean() }) });
  startSession("token-user-b");
  resolveOldResponse(jsonResponse({ ok: true }));

  await expect(pending).rejects.toMatchObject({ status: 401, code: "session_changed" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("не повторяет запоздавший 401 запросом новой учётной сессии", async () => {
  setAccessToken("token-user-a");
  let resolveOldResponse!: (response: Response) => void;
  const oldResponse = new Promise<Response>((resolve) => {
    resolveOldResponse = resolve;
  });
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/auth/refresh")) {
      return Promise.resolve(
        jsonResponse({
          access_token: "unexpected-token",
          token_type: "bearer",
          expires_in: 1800,
        }),
      );
    }
    return oldResponse;
  });
  vi.stubGlobal("fetch", fetchMock);

  const pending = api("/crm/leads/1", { schema: z.object({ ok: z.boolean() }) });
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Пока запрос пользователя A в пути, пользователь B входит в систему.
  startSession("token-user-b");
  resolveOldResponse(jsonResponse({ detail: "expired" }, 401));

  await expect(pending).rejects.toMatchObject({ status: 401, code: "session_changed" });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

describe("кеш справочников (tags и т.п.) не должен оседать в браузере", () => {
  it(
    "api() всегда запрашивает сеть с cache: no-store, даже если сервер " +
      "прислал Cache-Control: max-age (так отдаёт /crm/tags серверный fastapi-cache)",
    async () => {
      setAccessToken("токен");

      const fetchMock = vi.fn(async () => jsonResponse([{ id: 1, name: "Важное", color: "#112233" }]));
      vi.stubGlobal("fetch", fetchMock);

      await api("/crm/tags", {
        schema: z.array(z.object({ id: z.number(), name: z.string(), color: z.string() })),
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
      // Без этого флага браузер сам закэширует GET по заголовку сервера
      // Cache-Control: max-age=60 и после инвалидации в React Query будет
      // молча отдавать старый цвет тега вместо повторного запроса к серверу.
      expect(init.cache).toBe("no-store");
    },
  );
});

it("несколько запросов с 401 продлевают сессию одним общим запросом", async () => {
  // Сервер отзывает прежний токен при выдаче нового, поэтому пачка
  // одновременных продлений выбрасывала бы человека на страницу входа.
  let refreshCalls = 0;
  setAccessToken("старый");

  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return jsonResponse({ access_token: "новый", token_type: "bearer", expires_in: 1800 });
      }
      const token = (init?.headers as Record<string, string>)?.Authorization;
      if (token !== "Bearer новый") {
        return new Response(JSON.stringify({ detail: "нет доступа" }), { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }),
  );

  const responseSchema = z.object({ ok: z.boolean() });
  await Promise.all([
    api("/crm/leads", { schema: responseSchema }),
    api("/crm/tags", { schema: responseSchema }),
    api("/crm/stages", { schema: responseSchema }),
  ]);

  expect(refreshCalls).toBe(1);
});

describe("проверка успешных JSON-ответов", () => {
  it("отклоняет JSON, который не соответствует схеме ответа", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ id: "не число" })),
    );

    await expect(
      api("/crm/leads/1", { schema: z.object({ id: z.number() }) }),
    ).rejects.toMatchObject({
      status: 502,
      code: "invalid_response",
      endpoint: "GET /crm/leads/1",
      issues: [expect.objectContaining({ path: "id" })],
    });
  });

  it("проверяет пустой ответ 204 как undefined, не пытаясь читать JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(
      api("/admin/users/1", { method: "DELETE", schema: z.undefined() }),
    ).resolves.toBe(undefined);
  });

  it("сообщает ApiResponseError, если схема не принимает JSON 204", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 204 })),
    );

    await expect(
      api("/admin/users/1", { method: "DELETE", schema: z.object({ ok: z.boolean() }) }),
    ).rejects.toBeInstanceOf(ApiResponseError);
  });
});
