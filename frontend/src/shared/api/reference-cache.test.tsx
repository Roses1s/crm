/**
 * Справочники не перечитываются при каждом переходе.
 *
 * Общая настройка считает данные устаревшими через 30 секунд. Для этапов,
 * тегов, причин проигрыша и плиток лаунчера это слишком строго: они меняются
 * раз в месяц, а запрос уходил при каждом открытии экрана. Проверяем, что
 * через десять минут список этапов всё ещё берётся из памяти вкладки.
 */
import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { useStages } from "@/shared/api/hooks";
import { clearSessionCache, queryClient } from "@/shared/api/query-client";
import { startFakeApi, type FakeServer } from "@/test/fake-api";

function wrapper({ children }: { children: ReactNode }) {
  // Настоящий клиент приложения: проверяем боевые настройки кеша, а не тестовые.
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

let server: FakeServer | undefined;

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  server?.restore();
  server = undefined;
  clearSessionCache();
  clearTokens();
});

function stageCalls(): number {
  return (server?.calls ?? []).filter((call) => call.url.includes("/crm/stages")).length;
}

it("через десять минут список этапов берётся из памяти вкладки", async () => {
  setAccessToken("токен");
  server = startFakeApi([{ path: "/crm/stages", response: [] }]);

  const first = renderHook(() => useStages(), { wrapper });
  await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
  expect(stageCalls()).toBe(1);
  first.unmount();

  await act(async () => {
    await vi.advanceTimersByTimeAsync(10 * 60_000);
  });

  const second = renderHook(() => useStages(), { wrapper });
  await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

  // Прежняя настройка (30 секунд) сходила бы на сервер второй раз.
  expect(stageCalls()).toBe(1);
  second.unmount();
});
