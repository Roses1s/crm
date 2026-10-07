/** Все быстрые изменения лида отправляют серверу версию карточки, которую видел пользователь. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { useMoveLead, useUpdateLeadPriority } from "@/shared/api/hooks";
import { startFakeApi, type FakeServer } from "@/test/fake-api";

const VERSION = "2026-10-01T10:00:00.123456Z";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

let server: FakeServer | undefined;

afterEach(() => {
  server?.restore();
  server = undefined;
  clearTokens();
});

it("перемещение карточки передаёт прочитанную версию", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    { method: "PATCH", path: "/crm/leads/10", response: { id: 10, updated_at: VERSION } },
  ]);
  const { result } = renderHook(() => useMoveLead(), { wrapper: makeWrapper() });

  act(() => {
    result.current.mutate({ id: 10, stage_id: 2, expected_updated_at: VERSION });
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(server.calls.find((call) => call.method === "PATCH")?.body).toEqual({
    stage_id: 2,
    expected_updated_at: VERSION,
  });
});

it("смена приоритета передаёт прочитанную версию", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    { method: "PATCH", path: "/crm/leads/10", response: { id: 10, updated_at: VERSION } },
  ]);
  const { result } = renderHook(() => useUpdateLeadPriority(), { wrapper: makeWrapper() });

  act(() => {
    result.current.mutate({ id: 10, priority: 3, expected_updated_at: VERSION });
  });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  expect(server.calls.find((call) => call.method === "PATCH")?.body).toEqual({
    priority: 3,
    expected_updated_at: VERSION,
  });
});
