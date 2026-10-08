import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { LauncherApp, LossReason, Meta, Stage, Tag } from "@/shared/types";
import { api } from "../client";
import {
  arraySchema,
  launcherAppSchema,
  lossReasonSchema,
  metaSchema,
  stageSchema,
  tagSchema,
} from "../schemas";
import { apiVoid, keys, REFERENCE_DATA } from "./shared";

// --- справочники -------------------------------------------------------------
/**
 * Этапы доски. `ownerId` передаёт только администратор, когда открывает
 * доску сотрудника; свою доску запрашиваем без параметра.
 */
export function useStages(ownerId?: number | null) {
  return useQuery({
    queryKey: [...keys.stages, ownerId ?? "me"],
    queryFn: () =>
      api<Stage[]>(`/crm/stages${ownerId ? `?owner_id=${ownerId}` : ""}`, {
        schema: arraySchema(stageSchema),
      }),
    ...REFERENCE_DATA,
  });
}

/**
 * Служебные константы с сервера (ставка вычета маржи и т.п.) — единый
 * источник вместо продублированных чисел в коде фронтенда (Т-08).
 */
export function useMeta() {
  return useQuery({
    queryKey: keys.meta,
    queryFn: () => api<Meta>("/meta", { schema: metaSchema }),
    ...REFERENCE_DATA,
  });
}

export function useTags() {
  return useQuery({
    queryKey: keys.tags,
    queryFn: () => api<Tag[]>("/crm/tags", { schema: arraySchema(tagSchema) }),
    ...REFERENCE_DATA,
  });
}

/**
 * Тег — свободный общий справочник: доступен любому пользователю, не только
 * админу. Создание с именем, совпадающим (без учёта регистра) с уже
 * существующим тегом, переиспользует его.
 */
export function useCreateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; color: string }) =>
      api<Tag>("/crm/tags", { method: "POST", body, schema: tagSchema }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.tags }),
  });
}

/** Сервер не разрешает переименовать тег в имя, занятое другим тегом. */
export function useUpdateTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; color?: string }) =>
      api<Tag>(`/crm/tags/${id}`, { method: "PATCH", body, schema: tagSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.tags });
      // Название/цвет тега показаны везде, где он проставлен.
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: ["shipment"] });
    },
  });
}

export function useDeleteTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiVoid(`/crm/tags/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.tags });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: ["shipment"] });
    },
  });
}

export function useLossReasons() {
  return useQuery({
    queryKey: keys.lossReasons,
    queryFn: () =>
      api<LossReason[]>("/crm/loss-reasons", { schema: arraySchema(lossReasonSchema) }),
    ...REFERENCE_DATA,
  });
}

export function useLauncherApps() {
  return useQuery({
    queryKey: keys.apps,
    queryFn: () => api<LauncherApp[]>("/launcher/apps", { schema: arraySchema(launcherAppSchema) }),
    ...REFERENCE_DATA,
  });
}

export function useCreateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ownerId }: { name: string; ownerId?: number | null }) =>
      api<Stage>(`/crm/stages${ownerId ? `?owner_id=${ownerId}` : ""}`, {
        method: "POST",
        body: { name },
        schema: stageSchema,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.stages }),
  });
}

export function useUpdateStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number } & Partial<Stage>) =>
      api<Stage>(`/crm/stages/${id}`, { method: "PATCH", body, schema: stageSchema }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.stages });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
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
        schema: arraySchema(stageSchema),
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
      apiVoid(`/crm/stages/${id}${fallbackId ? `?fallback_stage_id=${fallbackId}` : ""}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.stages });
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["lead"] });
      void qc.invalidateQueries({ queryKey: ["timeline"] });
      void qc.invalidateQueries({ queryKey: ["pager"] });
      void qc.invalidateQueries({ queryKey: ["customers"] });
    },
  });
}
