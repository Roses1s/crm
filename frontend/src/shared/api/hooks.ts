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
  LauncherApp,
  Lead,
  Pager,
  Shipment,
  Stage,
  Tag,
  TimelineEntry,
  User,
} from "@/shared/types";
import { clearTokens, saveTokens } from "./auth";
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
  leads: (filters: LeadFilters) => ["leads", filters] as const,
  lead: (id: string | number) => ["lead", String(id)] as const,
  timeline: (id: string | number) => ["timeline", String(id)] as const,
  pager: (id: string | number) => ["pager", String(id)] as const,
  shipments: (status: string) => ["shipments", status] as const,
  shipment: (id: string | number) => ["shipment", String(id)] as const,
  leadShipments: (id: string | number) =>
    ["lead-shipments", String(id)] as const,
  attachments: (id: string | number) => ["attachments", String(id)] as const,
  shipmentAttachments: (id: string | number) =>
    ["shipment-attachments", String(id)] as const,
  carriers: ["carriers"] as const,
  users: ["users"] as const,
  backups: ["backups"] as const,
  loginAttempts: ["login-attempts"] as const,
};

// --- авторизация -------------------------------------------------------------
interface TokenPair {
  access_token: string;
  refresh_token: string;
}

export function useLogin() {
  return useMutation({
    mutationFn: (credentials: { email: string; password: string }) =>
      api<TokenPair>("/auth/login", {
        method: "POST",
        body: credentials,
        auth: false,
      }),
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

/** Может ли текущий пользователь менять справочники и архивировать записи. */
export function useCanManage(): boolean {
  const { data } = useMe();
  return data?.role === "admin" || data?.role === "manager";
}

// --- справочники -------------------------------------------------------------
/**
 * Этапы доски. `ownerId` передаёт только администратор, когда открывает
 * доску сотрудника; свою доску запрашиваем без параметра.
 */
export function useStages(ownerId?: number | null) {
  return useQuery({
    queryKey: [...keys.stages, ownerId ?? "me"],
    queryFn: () =>
      api<Stage[]>(`/crm/stages${ownerId ? `?owner_id=${ownerId}` : ""}`),
  });
}

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () => api<Tag[]>("/crm/tags"),
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
    mutationFn: ({
      name,
      ownerId,
    }: {
      name: string;
      ownerId?: number | null;
    }) =>
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

export function useDeleteStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, fallbackId }: { id: number; fallbackId?: number }) =>
      api<void>(
        `/crm/stages/${id}${fallbackId ? `?fallback_stage_id=${fallbackId}` : ""}`,
        { method: "DELETE" },
      ),
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

// --- лиды --------------------------------------------------------------------
export function useLeads(filters: LeadFilters = {}) {
  return useQuery({
    queryKey: keys.leads(filters),
    queryFn: () => api<Page<Lead>>(`/crm/leads?${leadsQueryString(filters)}`),
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

/** Поля, которые карточка лида отправляет на сервер. */
export interface LeadPayload {
  name: string;
  inn: string;
  kpp?: string;
  timezone?: string;
  company_email?: string | null;
  phone?: string;
  logist_contact?: string;
  logist_phone?: string;
  logist_email?: string | null;
  credit_limit?: string;
  first_call_date?: string | null;
  next_call_date?: string | null;
  priority?: number;
  stage_id?: number;
  tag_ids?: number[];
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LeadPayload) =>
      api<Lead>("/crm/leads", { method: "POST", body }),
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
              results: old.results.map((lead) =>
                lead.id === id ? { ...lead, stage_id } : lead,
              ),
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

export function useArchiveLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number | string) =>
      api<void>(`/crm/leads/${id}`, { method: "DELETE" }),
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
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: keys.timeline(id ?? "") }),
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

export function useUploadShipmentAttachment(
  shipmentId: string | number | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) =>
      apiUpload<Attachment>(`/shipments/${shipmentId}/attachments`, file),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: keys.shipmentAttachments(shipmentId ?? ""),
      });
    },
  });
}

export function useDeleteShipmentAttachment(
  shipmentId: string | number | undefined,
) {
  const qc = useQueryClient();
  return useMutation({
    // Удаление общее для всех вложений — ручка различает их по номеру файла.
    mutationFn: (attachmentId: number) =>
      api<void>(`/crm/attachments/${attachmentId}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: keys.shipmentAttachments(shipmentId ?? ""),
      });
    },
  });
}

/** Содержимое файла — для миниатюр и предпросмотра. */
export function attachmentBlob(attachmentId: number): Promise<Blob> {
  return apiBlob(`/crm/attachments/${attachmentId}`);
}

/** Скачивание: получаем файл с токеном и отдаём браузеру. */
export async function downloadAttachment(
  attachment: Attachment,
): Promise<void> {
  const blob = await attachmentBlob(attachment.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name;
  link.click();
  URL.revokeObjectURL(url);
}

// --- заявки ------------------------------------------------------------------
export function useShipments(status = "") {
  return useQuery({
    queryKey: keys.shipments(status),
    queryFn: () =>
      api<Page<Shipment>>(
        `/shipments?page_size=200${status ? `&status=${status}` : ""}`,
      ),
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
  lead_id: number;
  carrier_id?: number | null;
  city_loading?: string;
  city_unloading?: string;
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
    mutationFn: (body: UserPayload) =>
      api<User>("/admin/users", { method: "POST", body }),
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
    mutationFn: (id: number) =>
      api<void>(`/admin/users/${id}`, { method: "DELETE" }),
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
    mutationFn: () =>
      api<{ task_id: string }>("/admin/backup", { method: "POST" }),
    onSuccess: () => {
      // Файл появится через несколько секунд — обновим список с задержкой.
      setTimeout(
        () => void qc.invalidateQueries({ queryKey: keys.backups }),
        4000,
      );
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
