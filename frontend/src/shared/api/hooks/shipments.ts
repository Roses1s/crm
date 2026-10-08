import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { Shipment, ShipmentListItem, ShipmentTotals, TimelineEntry } from "@/shared/types";
import { api, type Page } from "../client";
import {
  arraySchema,
  shipmentListItemSchema,
  shipmentSchema,
  shipmentsPageSchema,
  timelineEntrySchema,
} from "../schemas";
import { apiVoid, keys, SHIPMENT_PAGE_SIZE, toInfiniteListResult } from "./shared";

// --- лента заявки ------------------------------------------------------------
export function useShipmentTimeline(id: string | undefined) {
  return useQuery({
    queryKey: keys.shipmentTimeline(id ?? "new"),
    queryFn: () =>
      api<TimelineEntry[]>(`/shipments/${id}/timeline`, {
        schema: arraySchema(timelineEntrySchema),
      }),
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
        schema: timelineEntrySchema,
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
        schema: timelineEntrySchema,
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.shipmentTimeline(id ?? "") }),
  });
}

export function useDeleteShipmentTimelineEntry(id: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: number) =>
      apiVoid(`/shipments/${id}/timeline/${entryId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: keys.shipmentTimeline(id ?? "") }),
  });
}

// --- заявки ------------------------------------------------------------------
/** Ответ списка заявок: обычная страница плюс итоги по всему фильтру. */
type ShipmentsPageData = Page<ShipmentListItem> & { totals: ShipmentTotals };

export function useShipments(status = "", search = "", assignedTo: number | null = null) {
  return useInfiniteQuery({
    queryKey: keys.shipments(status, search, assignedTo),
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams({
        page: String(pageParam),
        page_size: String(SHIPMENT_PAGE_SIZE),
      });
      if (status) params.set("status", status);
      if (search) params.set("search", search);
      // Отбор «заявки сотрудника» — админский; сервер сам проверит права.
      if (assignedTo !== null) params.set("assigned_to", String(assignedTo));
      return api<ShipmentsPageData>(`/shipments?${params.toString()}`, {
        schema: shipmentsPageSchema,
      });
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => lastPage.next ?? undefined,
    select: (data) => {
      const firstPage = data.pages[0];
      return {
        ...toInfiniteListResult(data, SHIPMENT_PAGE_SIZE),
        totals: firstPage?.totals ?? { margin: "0.00", customer_total: "0.00" },
      };
    },
  });
}

export function useShipment(id: string | undefined) {
  return useQuery({
    queryKey: keys.shipment(id ?? "new"),
    queryFn: () => api<Shipment>(`/shipments/${id}`, { schema: shipmentSchema }),
    enabled: Boolean(id) && id !== "new",
  });
}

export function useLeadShipments(id: number | string | undefined) {
  return useQuery({
    queryKey: keys.leadShipments(id ?? 0),
    queryFn: () =>
      api<ShipmentListItem[]>(`/leads/${id}/shipments`, {
        schema: arraySchema(shipmentListItemSchema),
      }),
    enabled: Boolean(id),
  });
}

export interface ShipmentPayload {
  number?: string;
  lead_id: number;
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

  // Перевозчик — свободный текст прямо в заявке, без справочника.
  carrier_name?: string;
  carrier_inn?: string;
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
        ? api<Shipment>("/shipments", { method: "POST", body, schema: shipmentSchema })
        : api<Shipment>(`/shipments/${id}`, { method: "PATCH", body, schema: shipmentSchema }),
    onSuccess: (data) => {
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: keys.shipment(data.id) });
      // При переносе заявки меняются сразу списки старого и нового лида.
      // Старый lead_id после ответа уже неизвестен, поэтому инвалидируем весь
      // небольшой namespace вкладок заявок, а не только новую карточку.
      void qc.invalidateQueries({ queryKey: ["lead-shipments"] });
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
        schema: shipmentSchema,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.shipment(id ?? "") });
      void qc.invalidateQueries({ queryKey: ["shipments"] });
      void qc.invalidateQueries({ queryKey: keys.shipmentTimeline(id ?? "") });
    },
  });
}
