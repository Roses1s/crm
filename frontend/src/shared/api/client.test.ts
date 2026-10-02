/**
 * Раньше при 401 только `api()` тихо продлевал сессию через refresh-куку и
 * повторял запрос; `apiUpload`/`apiBlob` при той же ситуации сразу падали с
 * ошибкой — человека выкидывало на логин посреди загрузки файла. Теперь все
 * три идут через общий `request()`, и это поведение проверяем здесь.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { api, apiBlob, apiUpload, ApiError } from "@/shared/api/client";

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
    const result = await apiUpload<{ id: number }>("/attachments", file);

    expect(result).toEqual({ id: 7 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("если refresh тоже не удался, apiBlob/apiUpload честно падают с 401", async () => {
    setAccessToken("stale-token");

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/auth/refresh")) return jsonResponse({ detail: "no session" }, 401);
      return jsonResponse({ detail: "expired" }, 401);
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiBlob("/attachments/1/file")).rejects.toBeInstanceOf(ApiError);
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

    const result = await api<{ ok: boolean }>("/crm/leads/1");

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("кеш справочников (tags/carriers) не должен оседать в браузере", () => {
  it(
    "api() всегда запрашивает сеть с cache: no-store, даже если сервер " +
      "прислал Cache-Control: max-age (так отдаёт /crm/tags серверный fastapi-cache)",
    async () => {
      setAccessToken("токен");

      const fetchMock = vi.fn(async () =>
        jsonResponse([{ id: 1, name: "Важное", color: "#112233" }]),
      );
      vi.stubGlobal("fetch", fetchMock);

      await api("/crm/tags");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0] as unknown as [unknown, RequestInit];
      // Без этого флага браузер сам закэширует GET по заголовку сервера
      // Cache-Control: max-age=60 и после инвалидации в React Query будет
      // молча отдавать старый цвет тега вместо повторного запроса к серверу.
      expect(init.cache).toBe("no-store");
    },
  );
});
