import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Providers } from "@/app/providers";
import { clearTokens, getAccessToken, refreshSession, setAccessToken, startSession } from "@/shared/api/auth";
import { useLeads, useMe } from "@/shared/api/hooks";

let hideProbe: () => void;
let showProbe: () => void;
let backendUser: "admin" | "manager" = "admin";

function Probe() {
  const { data: me } = useMe();
  const { data: leadsPage } = useLeads();
  const leads = leadsPage?.items ?? [];
  return <div>{`${me?.email ?? "загрузка"}|${leads[0]?.name ?? "загрузка"}`}</div>;
}

function Harness() {
  const [visible, setVisible] = useState(true);
  hideProbe = () => setVisible(false);
  showProbe = () => setVisible(true);
  return visible ? <Probe /> : <div>Экран входа</div>;
}

function userPayload(kind: "admin" | "manager") {
  return {
    id: kind === "admin" ? 1 : 2,
    email: `${kind}@example.test`,
    first_name: kind,
    last_name: "",
    role: kind,
    is_active: true,
  };
}

function leadPayload(kind: "admin" | "manager") {
  return {
    id: kind === "admin" ? 1 : 2,
    name: `${kind}-secret-lead`,
    inn: "7707083893",
    logist_contact: "",
    logist_phone: "",
    logist_email: null,
    accountant_name: null,
    priority: 0,
    is_archived: false,
    loss_reason_id: null,
    loss_reason_name: null,
    stage_id: 1,
    stage_name: "Новый",
    assigned_to_id: kind === "admin" ? 1 : 2,
    assigned_to_email: `${kind}@example.test`,
    assigned_to_name: kind,
    tags: [],
    created_at: "2026-10-02T12:00:00Z",
    updated_at: "2026-10-02T12:00:00Z",
  };
}

describe("изоляция Query cache между учётными сессиями", () => {
  beforeEach(() => {
    clearTokens();
    backendUser = "admin";
    setAccessToken("admin-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/auth/me")) {
          return Response.json(userPayload(backendUser));
        }
        if (url.includes("/crm/leads")) {
          return Response.json({
            count: 1,
            next: null,
            previous: null,
            results: [leadPayload(backendUser)],
          });
        }
        return new Response(null, { status: 204 });
      }),
    );
  });

  afterEach(() => {
    clearTokens();
    vi.unstubAllGlobals();
  });

  it("после logout и входа B не показывает свежие данные A", async () => {
    render(
      <Providers>
        <Harness />
      </Providers>,
    );
    await screen.findByText("admin@example.test|admin-secret-lead");

    act(() => hideProbe());
    clearTokens();
    backendUser = "manager";
    setAccessToken("manager-token");
    act(() => showProbe());

    // Старые данные имели staleTime 5 минут/30 секунд. Без полного clear()
    // они появлялись здесь синхронно, а запросы от имени manager не уходили.
    expect(screen.queryByText("admin@example.test|admin-secret-lead")).not.toBeInTheDocument();
    await screen.findByText("manager@example.test|manager-secret-lead");

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/auth/me"))).toHaveLength(
      2,
    );
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/crm/leads"))).toHaveLength(
      2,
    );
  });

  it("не принимает неполный JSON успешного refresh", async () => {
    clearTokens();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ access_token: "incomplete-token" })),
    );

    await expect(refreshSession()).resolves.toBe(false);
    expect(getAccessToken()).toBeNull();
  });

  it("refresh новой сессии не ждёт зависший refresh предыдущего пользователя", async () => {
    let finishOld: ((response: Response) => void) | undefined;
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        calls += 1;
        if (calls === 1) {
          return new Promise<Response>((resolve) => {
            finishOld = resolve;
          });
        }
        return Promise.resolve(
          Response.json({
            access_token: "fresh-user-b-token",
            token_type: "bearer",
            expires_in: 1800,
          }),
        );
      }),
    );

    const oldRefresh = refreshSession();
    startSession("user-b-login-token");

    await expect(refreshSession()).resolves.toBe(true);
    expect(getAccessToken()).toBe("fresh-user-b-token");

    finishOld?.(
      Response.json({
        access_token: "stale-user-a-token",
        token_type: "bearer",
        expires_in: 1800,
      }),
    );
    await expect(oldRefresh).resolves.toBe(false);
    expect(getAccessToken()).toBe("fresh-user-b-token");
    expect(calls).toBe(2);
  });

  it("поздний refresh не воскрешает уже завершённую сессию", async () => {
    let finishRefresh: ((response: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finishRefresh = resolve;
          }),
      ),
    );

    const pending = refreshSession();
    clearTokens();
    finishRefresh?.(Response.json({ access_token: "late-token" }));

    await expect(pending).resolves.toBe(false);
    expect(getAccessToken()).toBeNull();
  });
});
