/** Типы повторяют схемы бэкенда (backend/app/schemas). */

export type Role = "admin" | "manager";

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_active: boolean;
}

export interface LauncherApp {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  route: string;
  min_role: Role;
}

export interface Stage {
  id: number;
  name: string;
  sequence: number;
  color: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface LossReason {
  id: number;
  name: string;
}

export interface Lead {
  id: number;
  name: string;
  inn: string;
  logist_contact: string;
  logist_phone: string;
  logist_email: string | null;
  priority: number;
  is_archived: boolean;
  loss_reason_id?: number | null;
  loss_reason_name?: string | null;
  stage_id: number;
  stage_name: string;
  assigned_to_id: number | null;
  assigned_to_email?: string | null;
  assigned_to_name?: string | null;
  tags: Tag[];
  created_at?: string;
  updated_at?: string;
}

/**
 * Строка модуля «Клиенты» — ВСЕ лиды компании. Чужой активный лид приходит
 * с `can_open: false` и пустыми скрытыми полями (см. backend CustomerRead) —
 * карточку такого лида открывать нельзя, видно только имя, ИНН и продавца.
 */
export interface Customer {
  id: number;
  name: string;
  inn: string;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  is_archived: boolean;
  can_open: boolean;
  loss_reason_name?: string | null;
  logist_contact?: string | null;
  logist_phone?: string | null;
  logist_email?: string | null;
  priority?: number | null;
  stage_name?: string | null;
  tags?: Tag[];
  updated_at: string;
}

export interface Attachment {
  id: number;
  name: string;
  size: number;
  content_type: string;
  created_at: string;
}

export interface TimelineEntry {
  id: number | string;
  type: "note" | "history" | "message";
  body: string;
  field_label?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  /** Запись о переносе карточки между этапами: такую историю разрешено удалять. */
  is_stage_change?: boolean;
  attachments?: Attachment[];
  created_at: string;
  /** Заполняется бэкендом не всегда — подписи автора может не быть. */
  author_name?: string;
  author_initials?: string;
}

export interface Shipment {
  id: number;
  number: string;
  lead_id: number;
  lead_name: string;
  seller_name?: string | null;
  status: string;
  route: string;
  carrier_name?: string;
  created_at: string;
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

  tags?: Tag[];
}

export interface Pager {
  position: number;
  total: number;
  prev_id: number | null;
  next_id: number | null;
}
