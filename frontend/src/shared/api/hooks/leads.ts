import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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
  CUSTOMERS_LIMIT,
  invalidateLeadDetails,
  invalidateLeadLists,
  keys,
  leadsQueryString,
  LIST_LIMIT,
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

/**
 * Модуль «Клиенты»: ВСЕ лиды компании. Поиск — только по названию/ИНН (так же
 * ограничен и на бэкенде — это единственные поля, видимые на чужом активном
 * лиде). Запрашиваем первые CUSTOMERS_LIMIT записей и показываем их пачками
 * кнопкой «Показать ещё»; если на сервере их больше — об этом честно
 * сообщает ListLimitNotice.
 */
export function useCustomers(search: string) {
  return useQuery({
    queryKey: keys.customers(search),
    queryFn: () => {
      const params = new URLSearchParams({ page_size: String(CUSTOMERS_LIMIT) });
      if (search) params.set("search", search);
      return api<Page<Customer>>(`/crm/customers?${params.toString()}`, {
        schema: pageSchema(customerSchema),
      });
    },
    select: (page) => toListResult(page, CUSTOMERS_LIMIT),
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
    // Оптимистично: карточка переезжает сразу, до ответа сервера.
    onMutate: async ({ id, stage_id }) => {
      await qc.cancelQueries({ queryKey: ["leads"] });
      const snapshot = qc.getQueriesData<Page<Lead>>({ queryKey: ["leads"] });
      qc.setQueriesData<Page<Lead>>({ queryKey: ["leads"] }, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((lead) => (lead.id === id ? { ...lead, stage_id } : lead)),
            }
          : old,
      );
      return { snapshot };
    },
    onError: (error, variables, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
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
      const leadsSnapshot = qc.getQueriesData<Page<Lead>>({
        queryKey: ["leads"],
      });
      const leadSnapshot = qc.getQueryData<Lead>(keys.lead(id));

      qc.setQueriesData<Page<Lead>>({ queryKey: ["leads"] }, (old) =>
        old
          ? {
              ...old,
              results: old.results.map((lead) => (lead.id === id ? { ...lead, priority } : lead)),
            }
          : old,
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
