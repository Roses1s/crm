import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Attachment } from "@/shared/types";
import { api, apiBlob, apiUpload } from "../client";
import { arraySchema, attachmentSchema } from "../schemas";
import { apiVoid, keys } from "./shared";

// --- вложения ----------------------------------------------------------------
export function useLeadAttachments(id: string | number | undefined) {
  return useQuery({
    queryKey: keys.attachments(id ?? "new"),
    queryFn: () =>
      api<Attachment[]>(`/crm/leads/${id}/attachments`, {
        schema: arraySchema(attachmentSchema),
      }),
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
        attachmentSchema,
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
      apiVoid(`/crm/attachments/${attachmentId}`, { method: "DELETE" }),
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
    queryFn: () =>
      api<Attachment[]>(`/shipments/${id}/attachments`, {
        schema: arraySchema(attachmentSchema),
      }),
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
        attachmentSchema,
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
      apiVoid(`/crm/attachments/${attachmentId}`, { method: "DELETE" }),
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

/** Содержимое оригинала — для полноразмерного просмотра и скачивания. */
export function attachmentBlob(attachmentId: number, signal?: AbortSignal): Promise<Blob> {
  return apiBlob(`/crm/attachments/${attachmentId}`, signal);
}

/** Уменьшенная копия для превью в ленте; оригинал эта ручка не скачивает. */
export function attachmentThumbnailBlob(attachmentId: number, signal?: AbortSignal): Promise<Blob> {
  return apiBlob(`/crm/attachments/${attachmentId}/thumbnail`, signal);
}

/** Скачивание: получаем исходный файл с токеном и отдаём браузеру. */
export async function downloadAttachment(attachment: Attachment): Promise<void> {
  const blob = await attachmentBlob(attachment.id);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = attachment.name;
  link.click();
  URL.revokeObjectURL(url);
}
