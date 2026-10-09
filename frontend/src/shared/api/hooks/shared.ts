import type { InfiniteData, QueryClient } from "@tanstack/react-query";

import { api, type Page } from "../client";
import { voidResponseSchema } from "../schemas";

/** Размер одной порции в списках и на доске. */
export const LIST_LIMIT = 200; // Только для старых запросов, где нужен один ответ.
export const LEAD_PAGE_SIZE = 80;
export const CUSTOMER_PAGE_SIZE = 60;
export const KANBAN_PAGE_SIZE = 20;
export const SHIPMENT_PAGE_SIZE = 80;

type VoidApiOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  auth?: boolean;
};

/** Удаления возвращают 204; общая схема проверяет, что тело действительно пустое. */
export function apiVoid(path: string, options: VoidApiOptions = {}): Promise<void> {
  return api<undefined>(path, { ...options, schema: voidResponseSchema });
}

/** Список с сервера вместе с общим количеством записей. */
export interface ListResult<T> {
  items: T[];
  /** Сколько записей всего подходит под запрос (а не сколько показано). */
  total: number;
  /** Сколько записей максимум попало в ответ. */
  limit: number;
}

export function toListResult<T>(page: Page<T>, limit: number): ListResult<T> {
  return { items: page.results, total: page.count, limit };
}

/** Склеивает уже полученные серверные страницы, сохраняя общее количество. */
export function toInfiniteListResult<T>(
  data: InfiniteData<Page<T>, number>,
  pageSize: number,
): ListResult<T> {
  const firstPage = data.pages[0];
  return {
    items: data.pages.flatMap((page) => page.results),
    total: firstPage?.count ?? 0,
    limit: pageSize,
  };
}

export interface LeadFilters {
  search?: string;
  stage?: number | null;
  tag?: number | null;
  priority?: number | null;
  assigned?: number | null;
  archived?: boolean;
}

export function leadsQueryString(filters: LeadFilters, page = 1, pageSize = LIST_LIMIT): string {
  const params = new URLSearchParams({ page_size: String(pageSize) });
  if (page > 1) params.set("page", String(page));
  params.set("is_archived", filters.archived ? "true" : "false");
  if (filters.search) params.set("search", filters.search);
  if (filters.stage != null) params.set("stage", String(filters.stage));
  if (filters.tag != null) params.set("tag", String(filters.tag));
  if (filters.priority != null) params.set("priority", String(filters.priority));
  if (filters.assigned != null) params.set("assigned_to", String(filters.assigned));
  return params.toString();
}

/** Все ключи кеша API — в одном месте, чтобы мутации обновляли нужные экраны. */
export const keys = {
  me: ["me"] as const,
  apps: ["launcher"] as const,
  meta: ["meta"] as const,
  stages: ["stages"] as const,
  tags: ["tags"] as const,
  lossReasons: ["loss-reasons"] as const,
  // archived входит в ключ: списки «все / активные / проигранные» кешируются
  // раздельно, а инвалидация по префиксу ["customers"] по-прежнему бьёт во все.
  customers: (search: string, archived: boolean | null) => ["customers", search, archived] as const,
  leads: (filters: LeadFilters) => ["leads", filters] as const,
  leadPages: (filters: LeadFilters, pageSize: number) =>
    ["leads", "pages", filters, pageSize] as const,
  stageLeads: (stageId: number, filters: Omit<LeadFilters, "stage">, pageSize: number) =>
    ["leads", "stage", stageId, filters, pageSize] as const,
  lead: (id: string | number) => ["lead", String(id)] as const,
  timeline: (id: string | number) => ["timeline", String(id)] as const,
  pager: (id: string | number) => ["pager", String(id)] as const,
  shipments: (status: string, search = "", assignedTo: number | null = null) =>
    ["shipments", status, search, assignedTo] as const,
  shipment: (id: string | number) => ["shipment", String(id)] as const,
  leadShipments: (id: string | number) => ["lead-shipments", String(id)] as const,
  attachments: (id: string | number) => ["attachments", String(id)] as const,
  shipmentAttachments: (id: string | number) => ["shipment-attachments", String(id)] as const,
  shipmentTimeline: (id: string | number) => ["shipment-timeline", String(id)] as const,
  users: ["users"] as const,
  backups: ["backups"] as const,
  colleagues: ["colleagues"] as const,
  loginAttempts: ["login-attempts"] as const,
};

/** Обновляет CRM, клиентов, поиск по ИНН и листалку после изменения лида. */
export function invalidateLeadLists(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["leads"] });
  void qc.invalidateQueries({ queryKey: ["customers"] });
  void qc.invalidateQueries({ queryKey: ["customers-by-inn"] });
  void qc.invalidateQueries({ queryKey: ["pager"] });
}

/** Карточка и её лента меняются вместе при переносе, проигрыше и правке. */
export function invalidateLeadDetails(qc: QueryClient, id: string | number): void {
  void qc.invalidateQueries({ queryKey: keys.lead(id) });
  void qc.invalidateQueries({ queryKey: keys.timeline(id) });
}

/** Справочники редко меняются; собственные правки сразу сбрасывают их кеш. */
export const REFERENCE_DATA = {
  staleTime: 15 * 60_000,
  gcTime: 30 * 60_000,
  refetchOnWindowFocus: true,
} as const;
