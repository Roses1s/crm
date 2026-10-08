import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { clearTokens, setAccessToken } from "@/shared/api/auth";
import { useInfiniteLeads, useStageLeads } from "@/shared/api/hooks";
import { startFakeApi, type FakeServer } from "@/test/fake-api";

const UPDATED_AT = "2026-10-01T10:00:00.000Z";

function lead(id: number, stageId = 1) {
  return {
    id,
    name: `Клиент ${id}`,
    inn: `77012345${id.toString().padStart(2, "0")}`,
    logist_contact: "",
    logist_phone: "",
    logist_email: null,
    accountant_name: null,
    priority: 0,
    is_archived: false,
    loss_reason_id: null,
    loss_reason_name: null,
    stage_id: stageId,
    stage_name: stageId === 4 ? "Переговоры" : "Новый",
    assigned_to_id: 7,
    assigned_to_email: "manager@example.test",
    assigned_to_name: "Иван Петров",
    tags: [],
    created_at: UPDATED_AT,
    updated_at: UPDATED_AT,
  };
}

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

it("список лидов получает следующую страницу с прежним поиском и отбором", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    {
      path: "/crm/leads",
      query: {
        page: "2",
        page_size: "80",
        is_archived: "false",
        search: "Клиент",
        assigned_to: "7",
      },
      response: { count: 81, next: null, previous: 1, results: [lead(2)] },
    },
    {
      path: "/crm/leads",
      query: {
        page_size: "80",
        is_archived: "false",
        search: "Клиент",
        assigned_to: "7",
      },
      response: { count: 81, next: 2, previous: null, results: [lead(1)] },
    },
  ]);

  const { result } = renderHook(() => useInfiniteLeads({ search: "Клиент", assigned: 7 }), {
    wrapper: makeWrapper(),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toMatchObject({ items: [lead(1)], total: 81, limit: 80 });
  expect(result.current.hasNextPage).toBe(true);

  await act(async () => {
    await result.current.fetchNextPage();
  });

  await waitFor(() => expect(result.current.data?.items).toHaveLength(2));
  expect(result.current.data?.items.map((item) => item.id)).toEqual([1, 2]);
  const secondRequest = server.calls.find(
    (call) => new URL(call.url, "http://fake-api.local").searchParams.get("page") === "2",
  );
  expect(secondRequest).toBeDefined();
  const secondParams = new URL(secondRequest!.url, "http://fake-api.local").searchParams;
  expect(secondParams.get("search")).toBe("Клиент");
  expect(secondParams.get("assigned_to")).toBe("7");
});

it("этап Kanban загружает собственные страницы по 20 карточек", async () => {
  setAccessToken("токен");
  server = startFakeApi([
    {
      path: "/crm/leads",
      query: {
        page: "2",
        page_size: "20",
        is_archived: "false",
        stage: "4",
        assigned_to: "7",
      },
      response: { count: 21, next: null, previous: 1, results: [lead(2, 4)] },
    },
    {
      path: "/crm/leads",
      query: {
        page_size: "20",
        is_archived: "false",
        stage: "4",
        assigned_to: "7",
      },
      response: { count: 21, next: 2, previous: null, results: [lead(1, 4)] },
    },
  ]);

  const { result } = renderHook(() => useStageLeads(4, { assigned: 7 }), {
    wrapper: makeWrapper(),
  });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.pages[0]?.count).toBe(21);
  expect(result.current.hasNextPage).toBe(true);

  await act(async () => {
    await result.current.fetchNextPage();
  });

  await waitFor(() => expect(result.current.data?.pages).toHaveLength(2));
  expect(result.current.data?.pages.flatMap((page) => page.results.map((item) => item.id))).toEqual(
    [1, 2],
  );
  const secondRequest = server.calls.find(
    (call) => new URL(call.url, "http://fake-api.local").searchParams.get("page") === "2",
  );
  const secondParams = new URL(secondRequest!.url, "http://fake-api.local").searchParams;
  expect(secondParams.get("stage")).toBe("4");
  expect(secondParams.get("assigned_to")).toBe("7");
});
