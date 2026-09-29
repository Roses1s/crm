/**
 * Запросы к API через TanStack Query.
 *
 * Компоненты не знают про fetch и URL — только про эти хуки. Ключи кеша
 * собраны в одном месте, чтобы инвалидация после мутаций была предсказуемой.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Carrier,
  DashboardStats,
  LauncherApp,
  Lead,
  Pager,
  Shipment,
  Stage,
  Tag,
  TimelineEntry,
  User,
} from "@/shared/types";
import { api, type Page } from "./client";
import { clearTokens, saveTokens } from "./auth";

export const keys = {
  me: ["me"] as const,
  apps: ["launcher"] as const,
  stages: ["stages"] as const,
  tags: ["tags"] as const,
  leads: (archived: boolean) => ["leads", { archived }] as const,
  lead: (id: string | number) => ["lead", String(id)] as const,
  timeline: (id: string | number) => ["timeline", String(id)] as const,
  pager: (id: string | number) => ["pager", String(id)] as const,
  shipments: ["shipments"] as const,
  shipment: (id: string | number) => ["shipment", String(id)] as const,
  leadShipments: (id: string | number) => ["lead-shipments", String(id)] as const,
  carriers: ["carriers"] as const,
  users: ["users"] as const,
  stats: ["stats"] as const,
};

// --- авторизация -------------------------------------------------------------
interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<TokenPair>("/auth/login", { method: "POST", body: credentials, auth: false }),
    onSuccess: (data) => saveTokens(data.access_token, data.refresh_token),
  });
}

export function logout(): void {
  clearTokens();
}

export function useMe() {
  return useQuery({
    queryKey: keys.me,
    queryFn: () => api<User>("/auth/me"),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

// --- справочники -------------------------------------------------------------
export function useStages() {
  return useQuery({ queryKey: keys.stages, queryFn: () => api<Stage[]>("/crm/stages") });
}

export function useTags() {
  return useQuery({ queryKey: keys.tags, queryFn: () => api<Tag[]>("/crm/tags") });
}

export function useCarriers() {
  return useQuery({ queryKey: keys.carriers, queryFn: () => api<Carrier[]>("/carriers") });
}

export function useLauncherApps() {
  return useQuery({ queryKey: keys.apps, queryFn: () => api<LauncherApp[]>("/launcher/apps") });
}

// --- лиды --------------------------------------------------------------------
export function useLeads(archived = false) {
  return useQuery({
    queryKey: keys.leads(archived),
    queryFn: () =>
      api<Page<Lead>>(`/crm/leads?page_size=200&is_archived=${archived ? "true" : "false"}`),
    select: (page) => page.results,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: keys.lead(id ?? "new"),
    queryFn: () => api<Lead>(`/crm/leads/${id}`),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useLeadTimeline(id: string | undefined) {
  return useQuery({
    queryKey: keys.timeline(id ?? "new"),
    queryFn: () => api<TimelineEntry[]>(`/crm/leads/${id}/timeline`),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useLeadPager(id: string | undefined) {
  return useQuery({
    queryKey: keys.pager(id ?? "new"),
    queryFn: () => api<Pager>(`/crm/leads/${id}/pager`),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useSetLeadStage(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stage_id: number) =>
      api<Lead>(`/crm/leads/${id}`, { method: "PATCH", body: { stage_id } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.lead(id ?? "") });
      void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useAddNote(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<TimelineEntry>(`/crm/leads/${id}/notes`, { method: "POST", body: { body } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") }),
  });
}

// --- заявки ------------------------------------------------------------------
export function useShipments() {
  return useQuery({
    queryKey: keys.shipments,
    queryFn: () => api<Page<Shipment>>("/shipments?page_size=200"),
    select: (page) => page.results,
  });
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: keys.shipment(id ?? "new"),
    queryFn: () => api<Shipment>(`/shipments/${id}`),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useLeadShipments(id: number | string | undefined) {
  return useQuery({
    queryKey: keys.leadShipments(id ?? 0),
    queryFn: () => api<Shipment[]>(`/leads/${id}/shipments`),
    enabled: Boolean(id),
  });
}

// --- администрирование -------------------------------------------------------
export function useUsers() {
  return useQuery({ queryKey: keys.users, queryFn: () => api<User[]>("/admin/users") });
}

export function useStats() {
  return useQuery({ queryKey: keys.stats, queryFn: () => api<DashboardStats>("/admin/stats") });
}
