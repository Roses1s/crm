import {
  infiniteQueryOptions,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InfiniteData, QueryKey } from "@tanstack/react-query";

import type { Colleague, Customer, Lead, Pager, TimelineEntry } from "@/shared/types";
import { ApiError, api, type Page } from "../client";
import {
  arraySchema,
  colleagueSchema,
  customerSchema,
  leadSchema,
  pagerSchema,
  pageSchema,
  timelineEntrySchema,
} from "../schemas";
import {
  apiVoid,
  CUSTOMER_PAGE_SIZE,
  KANBAN_PAGE_SIZE,
  LEAD_PAGE_SIZE,
  invalidateLeadDetails,
  invalidateLeadLists,
  keys,
  leadsQueryString,
  LIST_LIMIT,
  toInfiniteListResult,
  toListResult,
  type LeadFilters,
} from "./shared";

// --- лиды --------------------------------------------------------------------
export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: keys.leads(filters),
    queryFn: () =>
      api<Page<Lead>>(`/crm/leads?${leadsQueryString(filters)}`, {
        schema: pageSchema(leadSchema),
      }),
    select: (page) => toListResult(page, LIST_LIMIT),
  });
}

function leadPagesOptions(
  queryKey: QueryKey,
  filters: LeadFilters,
  pageSize: number,
  enabled: boolean,
) {
  return infiniteQueryOptions({
    queryKey,
    queryFn: ({ pageParam }) =>
      api<Page<Lead>>(`/crm/leads?${leadsQueryString(filters, pageParam, pageSize)}`, {
        schema: pageSchema(leadSchema),
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    enabled,
  });
}

/** Параметры запроса для страницы списка лидов. */
export function leadPagesQueryOptions(
  filters: LeadFilters,
  pageSize = LEAD_PAGE_SIZE,
  enabled = true,
) {
  return leadPagesOptions(keys.leadPages(filters, pageSize), filters, pageSize, enabled);
}

/** Каждая колонка получает собственные страницы и свой счётчик с сервера. */
export function stageLeadPagesQueryOptions(
  stageId: number,
  filters: Omit<LeadFilters, "stage">,
  enabled = true,
) {
  const stageFilters: LeadFilters = { ...filters, stage: stageId };
  return leadPagesOptions(
    keys.stageLeads(stageId, filters, KANBAN_PAGE_SIZE),
    stageFilters,
    KANBAN_PAGE_SIZE,
    enabled,
  );
}

/** Серверные страницы одного этапа Kanban. */
export function useStageLeads(stageId: number, filters: Omit<LeadFilters, "stage">) {
  return useInfiniteQuery(stageLeadPagesQueryOptions(stageId, filters));
}

/** Лист лидов догружает следующую порцию, не теряя поиск и отбор доски. */
export function useInfiniteLeads(
  filters: LeadFilters = {},
  pageSize = LEAD_PAGE_SIZE,
  enabled = true,
) {
  return useInfiniteQuery({
    ...leadPagesQueryOptions(filters, pageSize, enabled),
    select: (data) => toInfiniteListResult(data, pageSize),
  });
}

/**
 * «Клиенты» показывает все лиды компании. Поиск ограничен названием и ИНН,
 * чтобы не раскрывать данные чужой карточки.
 */
export function useCustomers(search: string, archived: boolean | null = null) {
  return useInfiniteQuery({
    queryKey: keys.customers(search, archived),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        page_size: String(CUSTOMER_PAGE_SIZE),
      });
      if (search) params.set("search", search);
      // null — без фильтра (все вперемешку), как отвечает бэкенд по умолчанию.
      if (archived !== null) params.set("archived", String(archived));
      return api<Page<Customer>>(`/crm/customers?${params.toString()}`, {
        schema: pageSchema(customerSchema),
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    select: (data) => toInfiniteListResult(data, CUSTOMER_PAGE_SIZE),
  });
}

/**
 * Предупреждение о дубле ИНН при создании лида: ищет среди вообще всех
 * лидов (не только своих), бэкенд сам маскирует чужой активный лид так же,
 * как в списке «Клиенты». `enabled` — чтобы не долбить сервер на каждый
 * символ, пока ИНН ещё не дописан до валидной длины.
 */
export function useCustomersByInn(inn: string, excludeId?: number) {
  return useQuery({
    queryKey: ["customers-by-inn", inn, excludeId],
    queryFn: () => {
      const params = new URLSearchParams({ inn });
      if (excludeId != null) params.set("exclude_id", String(excludeId));
      return api<Customer[]>(`/crm/customers/by-inn?${params.toString()}`, {
        schema: arraySchema(customerSchema),
      });
    },
    enabled: inn.length >= 10,
    staleTime: 10_000,
  });
}

export function useLead(id: string | undefined) {
  return useQuery({
    queryKey: keys.lead(id ?? "new"),
    queryFn: () => api<Lead>(`/crm/leads/${id}`, { schema: leadSchema }),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useLeadTimeline(id: string | undefined) {
  return useQuery({
    queryKey: keys.timeline(id ?? "new"),
    queryFn: () =>
      api<TimelineEntry[]>(`/crm/leads/${id}/timeline`, {
        schema: arraySchema(timelineEntrySchema),
      }),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useLeadPager(id: string | undefined) {
  return useQuery({
    queryKey: keys.pager(id ?? "new"),
    queryFn: () => api<Pager>(`/crm/leads/${id}/pager`, { schema: pagerSchema }),
    enabled: Boolean(id) && id !== "new",
  });
}

/** Поля, которые карточка лида отправляет на сервер. */
export interface LeadPayload {
  name: string;
  inn: string;
  logist_contact?: string;
  logist_phone?: string;
  logist_email?: string | null;
  accountant_name?: string | null;
  priority?: number;
  stage_id?: number;
  tag_ids?: number[];
}

/** PATCH всегда содержит версию карточки, которую видел пользователь. */
export interface LeadUpdatePayload extends Partial<LeadPayload> {
  expected_updated_at: string;
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadPayload) =>
      api<Lead>("/crm/leads", { method: "POST", body, schema: leadSchema }),
    onSuccess: () => invalidateLeadLists(qc),
  });
}

export function useUpdateLead(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadUpdatePayload) =>
      api<Lead>(`/crm/leads/${id}`, { method: "PATCH", body, schema: leadSchema }),
    onSuccess: () => {
      invalidateLeadDetails(qc, id ?? "");
      invalidateLeadLists(qc);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "lead_conflict") {
        invalidateLeadDetails(qc, id ?? "");
        invalidateLeadLists(qc);
      }
    },
  });
}

/** Отдельный хук: смена этапа приходит и из карточки, и из канбана. */
export function useMoveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      stage_id,
      expected_updated_at,
    }: {
      id: number;
      stage_id: number;
      expected_updated_at: string;
    }) =>
      api<Lead>(`/crm/leads/${id}`, {
        method: "PATCH",
        body: { stage_id, expected_updated_at },
        schema: leadSchema,
      }),
    // Доска получает отдельные страницы для каждого этапа. Не переносим запись
    // вручную между срезами: после ответа сервера перечитываем обе колонки,
    // чтобы не показать дубль и не потерять карточку на границе страниц.
    onError: (error, variables) => {
      if (error instanceof ApiError && error.code === "lead_conflict") {
        invalidateLeadLists(qc);
        invalidateLeadDetails(qc, variables.id);
      }
    },
    onSuccess: (_data, variables) => {
      invalidateLeadLists(qc);
      invalidateLeadDetails(qc, variables.id);
    },
  });
}

type CachedLeadList = Page<Lead> | InfiniteData<Page<Lead>, number>;

/** Обновляет и обычные ответы, и кеши с несколькими страницами. */
function updateCachedLeads(
  old: CachedLeadList | undefined,
  update: (lead: Lead) => Lead,
): CachedLeadList | undefined {
  if (!old) return old;
  if ("pages" in old) {
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        results: page.results.map(update),
      })),
    };
  }
  return { ...old, results: old.results.map(update) };
}

/** Быстрая смена приоритета на доске: звёзды меняются до ответа сервера. */
export function useUpdateLeadPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      priority,
      expected_updated_at,
    }: {
      id: number;
      priority: number;
      expected_updated_at: string;
    }) =>
      api<Lead>(`/crm/leads/${id}`, {
        method: "PATCH",
        body: { priority, expected_updated_at },
        schema: leadSchema,
      }),
    onMutate: async ({ id, priority }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const leadsSnapshot = qc.getQueriesData<CachedLeadList>({
        queryKey: ["leads"],
      });
      const leadSnapshot = qc.getQueryData<Lead>(keys.lead(id));

      qc.setQueriesData<CachedLeadList>({ queryKey: ["leads"] }, (old) =>
        updateCachedLeads(old, (lead) => (lead.id === id ? { ...lead, priority } : lead)),
      );
      qc.setQueryData<Lead>(keys.lead(id), (old) => (old ? { ...old, priority } : old));
      return { leadsSnapshot, leadSnapshot, id };
    },
    onError: (error, variables, context) => {
      context?.leadsSnapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.leadSnapshot) {
        qc.setQueryData(keys.lead(context.id), context.leadSnapshot);
      }
      if (error instanceof ApiError && error.code === "lead_conflict") {
        invalidateLeadLists(qc);
        invalidateLeadDetails(qc, variables.id);
      }
    },
    onSuccess: (_data, { id }) => {
      invalidateLeadLists(qc);
      invalidateLeadDetails(qc, id);
    },
  });
}

/** Отметить лид проигранным — причина обязательна (см. LoseLeadDialog). */
export function useLoseLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reasonId }: { id: number | string; reasonId: number }) =>
      apiVoid(`/crm/leads/${id}/lose`, { method: "POST", body: { reason_id: reasonId } }),
    onSuccess: (_data, { id }) => {
      invalidateLeadLists(qc);
      invalidateLeadDetails(qc, id);
    },
  });
}

/** Забрать проигранный лид себе — доступно любому сотруднику, не только владельцу. */
export function useRestoreLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => apiVoid(`/crm/leads/${id}/restore`, { method: "POST" }),
    onSuccess: (_data, id) => {
      invalidateLeadLists(qc);
      invalidateLeadDetails(qc, id);
    },
  });
}

// Безвозвратное удаление — отдельная ручка от архивации (DELETE .../{id}
// выше её не трогает) и доступна только администратору.
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) =>
      apiVoid(`/crm/leads/${id}/permanent`, { method: "DELETE" }),
    onSuccess: (_data, id) => {
      invalidateLeadLists(qc);
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: ["shipment"] });
      void qc.invalidateQueries({ queryKey: ["shipment-timeline"] });
      void qc.invalidateQueries({ queryKey: ["shipment-attachments"] });
      qc.removeQueries({ queryKey: keys.lead(id), exact: true });
      qc.removeQueries({ queryKey: keys.timeline(id), exact: true });
      qc.removeQueries({ queryKey: keys.pager(id), exact: true });
      qc.removeQueries({ queryKey: keys.attachments(id), exact: true });
      qc.removeQueries({ queryKey: keys.leadShipments(id), exact: true });
    },
  });
}

export function useAddNote(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<TimelineEntry>(`/crm/leads/${id}/notes`, {
        method: "POST",
        body: { body },
        schema: timelineEntrySchema,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") }),
  });
}

export function useEditNote(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, body }: { entryId: number; body: string }) =>
      api<TimelineEntry>(`/crm/leads/${id}/timeline/${entryId}`, {
        method: "PATCH",
        body: { body },
        schema: timelineEntrySchema,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") }),
  });
}

export function useDeleteTimelineEntry(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      apiVoid(`/crm/leads/${id}/timeline/${entryId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") }),
  });
}

// --- передача лида -----------------------------------------------------------
/** Активные сотрудники, кроме себя, — для выбора нового продавца. */
export function useColleagues() {
  return useQuery({
    queryKey: keys.colleagues,
    queryFn: () => api<Colleague[]>("/users/colleagues", { schema: arraySchema(colleagueSchema) }),
    staleTime: 5 * 60_000,
  });
}

export function useTransferLead(leadId: string | number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiVoid(`/crm/leads/${leadId}/transfer`, {
        method: "POST",
        body: { user_id: userId },
      }),
    onSuccess: () => {
      // Перенос меняет ответственного, этап и историю — обновляем все эти экраны.
      invalidateLeadLists(qc);
      invalidateLeadDetails(qc, leadId ?? "");
      void qc.invalidateQueries({ queryKey: keys.pager(leadId ?? "") });
    },
  });
}
