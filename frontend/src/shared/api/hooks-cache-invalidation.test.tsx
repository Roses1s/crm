/** Мутации лида должны обновлять все списки и карточки, где он отображается. */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { clearTokens, setAccessToken } from "@/shared/api/auth";
import {
  useCreateLead,
  useCustomers,
  useCustomersByInn,
  useDeleteLead,
  useLeads,
} from "@/shared/api/hooks";
import { page, startFakeApi, type FakeServer } from "@/test/fake-api";

function makeClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

let server: FakeServer | undefined;
const clients: QueryClient[] = [];

afterEach(() => {
  server?.restore();
  server = undefined;
  clients.splice(0).forEach((client) => client.clear());
  clearTokens();
});

it("после создания лида перечитывает и CRM, и список клиентов", async () => {
  setAccessToken("токен");
  const lead = {
    id: 10,
    name: "ООО Ромашка",
    inn: "1234567890",
    logist_contact: "",
    logist_phone: "",
    logist_email: null,
    accountant_name: null,
    priority: 1,
    is_archived: false,
    loss_reason_id: null,
    loss_reason_name: null,
    stage_id: 1,
    stage_name: "Новый",
    assigned_to_id: 1,
    assigned_to_email: "manager@example.test",
    assigned_to_name: "Мария",
    tags: [],
    created_at: "2026-10-01T10:00:00Z",
    updated_at: "2026-10-01T10:00:00Z",
  };
  server = startFakeApi([
    { path: "/crm/leads", response: page([]) },
    { path: "/crm/customers/by-inn", response: [] },
    { path: "/crm/customers", response: page([]) },
    { method: "POST", path: "/crm/leads", response: lead },
  ]);
  const { client, wrapper } = makeClient();
  clients.push(client);

  const { result } = renderHook(
    () => ({
      leads: useLeads(),
      customers: useCustomers(""),
      byInn: useCustomersByInn(lead.inn),
      create: useCreateLead(),
    }),
    { wrapper },
  );
  await waitFor(() => expect(result.current.leads.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.customers.isSuccess).toBe(true));
  await waitFor(() => expect(result.current.byInn.isSuccess).toBe(true));

  act(() => {
    result.current.create.mutate({ name: lead.name, inn: lead.inn });
  });
  await waitFor(() => expect(result.current.create.isSuccess).toBe(true));
  await waitFor(() => {
    expect(
      server?.calls.filter((call) => call.method === "GET" && call.url.includes("/crm/leads")),
    ).toHaveLength(2);
    expect(
      server?.calls.filter((call) => call.method === "GET" && call.url.includes("/crm/customers?")),
    ).toHaveLength(2);
    expect(
      server?.calls.filter(
        (call) => call.method === "GET" && call.url.includes("/crm/customers/by-inn"),
      ),
    ).toHaveLength(2);
  });
});

it("после безвозвратного удаления очищает карточку и обновляет кеш заявок", async () => {
  setAccessToken("токен");
  server = startFakeApi([{ method: "DELETE", path: "/crm/leads/10/permanent", response: null }]);
  const { client, wrapper } = makeClient();
  clients.push(client);

  const cachedKeys: (readonly unknown[])[] = [
    ["lead", "10"],
    ["timeline", "10"],
    ["pager", "10"],
    ["attachments", "10"],
    ["lead-shipments", "10"],
    ["shipments", "", "", null],
    ["shipment", "101"],
    ["shipment-timeline", "101"],
    ["shipment-attachments", "101"],
  ];
  cachedKeys.forEach((key) => client.setQueryData(key, { cached: true }));

  const { result } = renderHook(() => useDeleteLead(), { wrapper });
  act(() => result.current.mutate(10));
  await waitFor(() => expect(result.current.isSuccess).toBe(true));

  for (const key of cachedKeys.slice(0, 5)) expect(client.getQueryState(key)).toBeUndefined();
  for (const key of cachedKeys.slice(5)) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
});
