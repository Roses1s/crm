/**
 * Запросы и мутации к API через TanStack Query.
 *
 * Компоненты не знают про fetch и URL — только про эти хуки. Ключи кеша
 * собраны в одном месте, поэтому после мутации понятно, что инвалидировать.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  Attachment,
  Carrier,
  Customer,
  LauncherApp,
  Lead,
  LossReason,
  Pager,
  Shipment,
  Stage,
  Tag,
  TimelineEntry,
  User,
} from "@/shared/types";
import { clearTokens, setAccessToken } from "./auth";
import { api, apiBlob, apiUpload, type Page } from "./client";

export interface LeadFilters {
  search?: string;
  stage?: number | null;
  tag?: number | null;
  priority?: number | null;
  assigned?: number | null;
  archived?: boolean;
}

function leadsQueryString(filters: LeadFilters): string {
  const params = new URLSearchParams({ page_size: "200" });
  params.set("is_archived", filters.archived ? "true" : "false");
  if (filters.search) params.set("search", filters.search);
  if (filters.stage) params.set("stage", String(filters.stage));
  if (filters.tag) params.set("tag", String(filters.tag));
  if (filters.priority) params.set("priority", String(filters.priority));
  if (filters.assigned) params.set("assigned_to", String(filters.assigned));
  return params.toString();
}

export const keys = {
  me: ["me"] as const,
  apps: ["launcher"] as const,
  stages: ["stages"] as const,
  tags: ["tags"] as const,
  lossReasons: ["loss-reasons"] as const,
  customers: (search: string) => ["customers", search] as const,
  leads: (filters: LeadFilters) => ["leads", filters] as const,
  lead: (id: string | number) => ["lead", String(id)] as const,
  timeline: (id: string | number) => ["timeline", String(id)] as const,
  pager: (id: string | number) => ["pager", String(id)] as const,
  shipments: (status: string, search = "") => ["shipments", status, search] as const,
  shipment: (id: string | number) => ["shipment", String(id)] as const,
  leadShipments: (id: string | number) => ["lead-shipments", String(id)] as const,
  attachments: (id: string | number) => ["attachments", String(id)] as const,
  shipmentAttachments: (id: string | number) => ["shipment-attachments", String(id)] as const,
  shipmentTimeline: (id: string | number) => ["shipment-timeline", String(id)] as const,
  carriers: ["carriers"] as const,
  users: ["users"] as const,
  backups: ["backups"] as const,
  colleagues: ["colleagues"] as const,
  loginAttempts: ["login-attempts"] as const,
};

// --- авторизация -------------------------------------------------------------
interface AccessTokenResponse {
  access_token: string;
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<AccessTokenResponse>("/auth/login", {
        method: "POST",
        body: credentials,
        auth: false,
      }),
    // Обновляющий токен сервер кладёт в куку сам, нам приходит только короткий.
    onSuccess: (data) => setAccessToken(data.access_token),
  });
}

export function logout(): void {
  // Куку может стереть только сервер — она недоступна скриптам.
  void fetch("/api/v1/auth/logout", { method: "POST" }).finally(() => clearTokens());
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
/**
 * Этапы доски. `ownerId` передаёт только администратор, когда открывает
 * доску сотрудника; свою доску запрашиваем без параметра.
 */
export function useStages(ownerId?: number | null) {
  return useQuery({
    queryKey: [...keys.stages, ownerId ?? "me"],
    queryFn: () => api<Stage[]>(`/crm/stages${ownerId ? `?owner_id=${ownerId}` : ""}`),
  });
}

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () => api<Tag[]>("/crm/tags"),
  });
}

/**
 * Тег — свободный общий справочник: доступен любому пользователю, не только
 * админу. Создание с именем, совпадающим (без учёта регистра) с уже
 * существующим тегом, переиспользует его — сервер сам решает, бэкенд здесь
 * ни о чём не предупреждает отдельно.
 */
export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; color: string }) =>
      api<Tag>("/crm/tags", { method: "POST", body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.tags }),
  });
}

export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; color?: string }) =>
      api<Tag>(`/crm/tags/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.tags });
      // Название/цвет тега показаны везде, где он проставлен.
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: keys.carriers });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/crm/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.tags });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: keys.carriers });
    },
  });
}

export function useLossReasons() {
  return useQuery({
    queryKey: keys.lossReasons,
    queryFn: () => api<LossReason[]>("/crm/loss-reasons"),
  });
}

export function useCarriers() {
  return useQuery({
    queryKey: keys.carriers,
    queryFn: () => api<Carrier[]>("/carriers"),
  });
}

export function useLauncherApps() {
  return useQuery({
    queryKey: keys.apps,
    queryFn: () => api<LauncherApp[]>("/launcher/apps"),
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ownerId }: { name: string; ownerId?: number | null }) =>
      api<Stage>(`/crm/stages${ownerId ? `?owner_id=${ownerId}` : ""}`, {
        method: "POST",
        body: { name },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.stages }),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Stage>) =>
      api<Stage>(`/crm/stages/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.stages });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/** Полный порядок этапов меняется одним запросом после горизонтального DnD. */
export function useReorderStages() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stageIds: number[]) =>
      api<Stage[]>("/crm/stages/reorder", {
        method: "POST",
        body: { stage_ids: stageIds },
      }),
    onMutate: async (stageIds) => {
      await qc.cancelQueries({ queryKey: keys.stages });
      const snapshot = qc.getQueriesData<Stage[]>({ queryKey: keys.stages });

      qc.setQueriesData<Stage[]>({ queryKey: keys.stages }, (old) => {
        if (!old || old.length !== stageIds.length) return old;
        const byId = new Map(old.map((stage) => [stage.id, stage]));
        if (stageIds.some((id) => !byId.has(id))) return old;
        return stageIds.map((id, index) => ({
          ...byId.get(id)!,
          sequence: index + 1,
        }));
      });
      return { snapshot };
    },
    onError: (_error, _stageIds, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.stages }),
  });
}

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fallbackId }: { id: number; fallbackId?: number }) =>
      api<void>(`/crm/stages/${id}${fallbackId ? `?fallback_stage_id=${fallbackId}` : ""}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.stages });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

export function useCreateCarrier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; inn: string }) =>
      api<Carrier>("/carriers", { method: "POST", body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.carriers }),
  });
}

/** Теги перевозчика — рабочая пометка, её может проставить любой сотрудник. */
export function useSetCarrierTags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, tagIds }: { id: number; tagIds: number[] }) =>
      api<Carrier>(`/carriers/${id}/tags`, { method: "PUT", body: { tag_ids: tagIds } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.carriers }),
  });
}

// --- лиды --------------------------------------------------------------------
export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: keys.leads(filters),
    queryFn: () => api<Page<Lead>>(`/crm/leads?${leadsQueryString(filters)}`),
    select: (page) => page.results,
  });
}

/**
 * Модуль «Клиенты»: ВСЕ лиды компании. Поиск — только по названию/ИНН (так же
 * ограничен и на бэкенде — это единственные поля, видимые на чужом активном
 * лиде). page_size на максимум: отдельной пагинации в интерфейсе пока нет,
 * список подгружается целиком и режется на клиенте кнопкой «Показать ещё».
 */
export function useCustomers(search: string) {
  return useQuery({
    queryKey: keys.customers(search),
    queryFn: () => {
      const params = new URLSearchParams({ page_size: "500" });
      if (search) params.set("search", search);
      return api<Page<Customer>>(`/crm/customers?${params.toString()}`);
    },
    select: (page) => page.results,
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
      return api<Customer[]>(`/crm/customers/by-inn?${params.toString()}`);
    },
    enabled: inn.length >= 10,
    staleTime: 10_000,
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

/** Поля, которые карточка лида отправляет на сервер. */
export interface LeadPayload {
  name: string;
  inn: string;
  logist_contact?: string;
  logist_phone?: string;
  logist_email?: string | null;
  priority?: number;
  stage_id?: number;
  tag_ids?: number[];
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadPayload) => api<Lead>("/crm/leads", { method: "POST", body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useUpdateLead(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<LeadPayload>) =>
      api<Lead>(`/crm/leads/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.lead(id ?? "") });
      void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") });
      void qc.invalidateQueries({ queryKey: ["leads"] });
    },
  });
}

/** Отдельный хук: смена этапа приходит и из карточки, и из канбана. */
export function useMoveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stage_id }: { id: number; stage_id: number }) =>
      api<Lead>(`/crm/leads/${id}`, { method: "PATCH", body: { stage_id } }),
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
    onError: (_error, _variables, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: keys.lead(variables.id) });
      void qc.invalidateQueries({ queryKey: keys.timeline(variables.id) });
    },
  });
}

/** Быстрая смена приоритета на доске: звёзды меняются до ответа сервера. */
export function useUpdateLeadPriority() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priority }: { id: number; priority: number }) =>
      api<Lead>(`/crm/leads/${id}`, { method: "PATCH", body: { priority } }),
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
    onError: (_error, _variables, context) => {
      context?.leadsSnapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      if (context?.leadSnapshot) {
        qc.setQueryData(keys.lead(context.id), context.leadSnapshot);
      }
    },
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: keys.lead(id) });
      void qc.invalidateQueries({ queryKey: keys.timeline(id) });
    },
  });
}

/** Отметить лид проигранным — причина обязательна (см. LoseLeadDialog). */
export function useLoseLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reasonId }: { id: number | string; reasonId: number }) =>
      api<void>(`/crm/leads/${id}/lose`, { method: "POST", body: { reason_id: reasonId } }),
    onSuccess: (_data, { id }) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: keys.lead(id) });
      void qc.invalidateQueries({ queryKey: keys.timeline(id) });
    },
  });
}

/** Забрать проигранный лид себе — доступно любому сотруднику, не только владельцу. */
export function useRestoreLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) => api<void>(`/crm/leads/${id}/restore`, { method: "POST" }),
    onSuccess: (_data, id) => {
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: keys.lead(id) });
      void qc.invalidateQueries({ queryKey: keys.timeline(id) });
    },
  });
}

// Безвозвратное удаление — отдельная ручка от архивации (DELETE .../{id}
// выше её не трогает) и доступна только администратору.
export function useDeleteLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) =>
      api<void>(`/crm/leads/${id}/permanent`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["leads"] }),
  });
}

export function useAddNote(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<TimelineEntry>(`/crm/leads/${id}/notes`, {
        method: "POST",
        body: { body },
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
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") }),
  });
}

export function useDeleteTimelineEntry(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      api<void>(`/crm/leads/${id}/timeline/${entryId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") }),
  });
}

// --- передача лида -----------------------------------------------------------
export interface Colleague {
  id: number;
  first_name: string;
  last_name: string;
  full_name: string;
}

/** Активные сотрудники, кроме себя, — для выбора нового продавца. */
export function useColleagues() {
  return useQuery({
    queryKey: keys.colleagues,
    queryFn: () => api<Colleague[]>("/users/colleagues"),
    staleTime: 5 * 60_000,
  });
}

export function useTransferLead(leadId: string | number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      api<void>(`/crm/leads/${leadId}/transfer`, {
        method: "POST",
        body: { user_id: userId },
      }),
    onSuccess: () => {
      // Карточка ушла с нашей доски — обновляем и список, и саму карточку.
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: keys.lead(leadId ?? "") });
    },
  });
}

// --- вложения ----------------------------------------------------------------
export function useLeadAttachments(id: string | number | undefined) {
  return useQuery({
    queryKey: keys.attachments(id ?? "new"),
    queryFn: () => api<Attachment[]>(`/crm/leads/${id}/attachments`),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useUploadAttachment(leadId: string | number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, entryId }: { file: File; entryId?: number }) =>
      apiUpload<Attachment>(
        `/crm/leads/${leadId}/attachments${entryId ? `?entry_id=${entryId}` : ""}`,
        file,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.attachments(leadId ?? "") });
      void qc.invalidateQueries({ queryKey: keys.timeline(leadId ?? "") });
    },
  });
}

export function useDeleteAttachment(leadId: string | number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: number) =>
      api<void>(`/crm/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.attachments(leadId ?? "") });
      void qc.invalidateQueries({ queryKey: keys.timeline(leadId ?? "") });
    },
  });
}

/** Вложения заявки: отдельный список, в файлы лида они намеренно не попадают. */
export function useShipmentAttachments(id: string | number | undefined) {
  return useQuery({
    queryKey: keys.shipmentAttachments(id ?? "new"),
    queryFn: () => api<Attachment[]>(`/shipments/${id}/attachments`),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useUploadShipmentAttachment(shipmentId: string | number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, entryId }: { file: File; entryId?: number }) =>
      apiUpload<Attachment>(
        `/shipments/${shipmentId}/attachments${entryId ? `?entry_id=${entryId}` : ""}`,
        file,
      ),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: keys.shipmentAttachments(shipmentId ?? ""),
      });
      void qc.invalidateQueries({
        queryKey: keys.shipmentTimeline(shipmentId ?? ""),
      });
    },
  });
}

export function useDeleteShipmentAttachment(shipmentId: string | number | undefined) {
  const qc = useQueryClient();
  return useMutation({
    // Удаление общее для всех вложений — ручка различает их по номеру файла.
    mutationFn: (attachmentId: number) =>
      api<void>(`/crm/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: keys.shipmentAttachments(shipmentId ?? ""),
      });
      void qc.invalidateQueries({
        queryKey: keys.shipmentTimeline(shipmentId ?? ""),
      });
    },
  });
}

// --- лента заявки ------------------------------------------------------------
export function useShipmentTimeline(id: string | undefined) {
  return useQuery({
    queryKey: keys.shipmentTimeline(id ?? "new"),
    queryFn: () => api<TimelineEntry[]>(`/shipments/${id}/timeline`),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useAddShipmentNote(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) =>
      api<TimelineEntry>(`/shipments/${id}/notes`, {
        method: "POST",
        body: { body },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.shipmentTimeline(id ?? "") }),
  });
}

export function useEditShipmentNote(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ entryId, body }: { entryId: number; body: string }) =>
      api<TimelineEntry>(`/shipments/${id}/timeline/${entryId}`, {
        method: "PATCH",
        body: { body },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.shipmentTimeline(id ?? "") }),
  });
}

export function useDeleteShipmentTimelineEntry(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      api<void>(`/shipments/${id}/timeline/${entryId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.shipmentTimeline(id ?? "") }),
  });
}

/** Содержимое файла — для миниатюр и предпросмотра. */
export function attachmentBlob(attachmentId: number): Promise<Blob> {
  return apiBlob(`/crm/attachments/${attachmentId}`);
}

/** Скачивание: получаем файл с токеном и отдаём браузеру. */
export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const blob = await attachmentBlob(attachment.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name;
  link.click();
  URL.revokeObjectURL(url);
}

// --- заявки ------------------------------------------------------------------
export function useShipments(status = "", search = "") {
  return useQuery({
    queryKey: keys.shipments(status, search),
    queryFn: () => {
      const params = new URLSearchParams({ page_size: "200" });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      return api<Page<Shipment>>(`/shipments?${params.toString()}`);
    },
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

export interface ShipmentPayload {
  number?: string;
  lead_id: number;
  carrier_id?: number | null;
  // Дата создания — редактируема (заявку часто заводят в CRM позже, чем она
  // реально возникла). ISO-строка с временем; null сервер не примет (колонка
  // NOT NULL) — форма всегда отправляет либо настоящее значение, либо вообще
  // не включает поле в тело запроса.
  created_at?: string;
  address_loading?: string;
  address_unloading?: string;
  contact_loading_name?: string;
  contact_loading_phone?: string;
  contact_unloading_name?: string;
  contact_unloading_phone?: string;
  transport_type?: string;
  cargo_weight?: string | null;
  cargo_volume?: string | null;
  comment?: string;

  // Позиция заказа: цена заказчика/перевозчика, у каждой своя ставка НДС.
  customer_price?: string | null;
  customer_tax?: string;
  carrier_price?: string | null;
  carrier_tax?: string;

  // Заказчик (шапка).
  customer_address?: string;
  customer_contact?: string;
  customer_signer?: string;

  // Погрузка.
  loading_cities?: string[];
  loading_date_from?: string | null;
  loading_date_to?: string | null;
  loading_time_from?: string;
  loading_time_to?: string;

  // Выгрузка.
  unloading_cities?: string[];
  unloading_date_from?: string | null;
  unloading_date_to?: string | null;
  unloading_time_from?: string;
  unloading_time_to?: string;

  // Перевозчик.
  carrier_contact?: string;
  vehicle?: string;
  vehicle_number?: string;
  has_trailer?: boolean;
  trailer_number?: string;
  driver_name?: string;
  driver_phone?: string;
  driver_passport?: string;
  carrier_signer?: string;

  // Груз.
  cargo_type?: string;
  cargo_packaging?: string;
  capacity?: string | null;
  body_type?: string[];
  loading_method?: string[];

  tag_ids?: number[];
}

export function useSaveShipment(id: string | undefined) {
  const qc = useQueryClient();
  const isNew = !id || id === "new";
  return useMutation({
    mutationFn: (body: ShipmentPayload) =>
      isNew
        ? api<Shipment>("/shipments", { method: "POST", body })
        : api<Shipment>(`/shipments/${id}`, { method: "PATCH", body }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: keys.shipment(data.id) });
      void qc.invalidateQueries({ queryKey: keys.leadShipments(data.lead_id) });
    },
  });
}

export function useSetShipmentStatus(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: string) =>
      api<Shipment>(`/shipments/${id}/status`, {
        method: "PATCH",
        body: { status },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.shipment(id ?? "") });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: keys.shipmentTimeline(id ?? "") });
    },
  });
}

// --- администрирование -------------------------------------------------------
export function useUsers() {
  return useQuery({
    queryKey: keys.users,
    queryFn: () => api<User[]>("/admin/users"),
  });
}

export interface UserPayload {
  email: string;
  first_name?: string;
  last_name?: string;
  role?: string;
  password?: string;
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UserPayload) => api<User>("/admin/users", { method: "POST", body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<UserPayload>) =>
      api<User>(`/admin/users/${id}`, { method: "PATCH", body }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.users }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api<void>(`/admin/users/${id}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.users }),
  });
}

interface BackupsResponse {
  storage: { files: number; bytes: number; free_bytes: number };
  results: { name: string; size: number }[];
  last_backup_at: string | null;
  age_hours: number | null;
  is_stale: boolean;
}

export function useBackups() {
  return useQuery({
    queryKey: keys.backups,
    queryFn: () => api<BackupsResponse>("/admin/backups"),
  });
}

export function useRunBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ task_id: string }>("/admin/backup", { method: "POST" }),
    onSuccess: () => {
      // Файл появится через несколько секунд — обновим список с задержкой.
      setTimeout(() => void qc.invalidateQueries({ queryKey: keys.backups }), 4000);
    },
  });
}

export function useLoginAttempts() {
  return useQuery({
    queryKey: keys.loginAttempts,
    queryFn: () =>
      api<
        {
          id: number;
          username: string;
          ip_address: string;
          attempt_time: string;
          failures: number;
        }[]
      >("/admin/login-attempts"),
  });
}
