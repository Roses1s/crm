/** Типы повторяют схемы бэкенда (backend/app/schemas). */

export type Role = "admin" | "manager" | "operator";

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
  is_closed: boolean;
  color: string;
}

export interface Tag {
  id: number;
  name: string;
  color: string;
}

export interface Lead {
  id: number;
  name: string;
  inn: string;
  kpp: string;
  timezone: string;
  company_email: string | null;
  phone: string;
  logist_contact: string;
  logist_phone: string;
  logist_email: string | null;
  credit_limit: string;
  first_call_date: string | null;
  next_call_date: string | null;
  priority: number;
  is_archived: boolean;
  stage_id: number;
  stage_name: string;
  assigned_to_id: number | null;
  assigned_to_email?: string | null;
  assigned_to_name?: string | null;
  tags: Tag[];
  activity_state?: ActivityState | null;
  next_activity_date?: string | null;
  next_activity_summary?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ActivityType = "call" | "meeting" | "todo" | "email";
export type ActivityState = "overdue" | "today" | "planned" | "done";

export interface Activity {
  id: number;
  lead_id: number;
  type: ActivityType;
  summary: string;
  note: string;
  due_date: string;
  is_done: boolean;
  state: ActivityState;
  assigned_to_id: number | null;
  assigned_to_name: string | null;
  created_at: string;
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
  type: "note" | "history" | "message" | "activity";
  body: string;
  field_label?: string | null;
  old_value?: string | null;
  new_value?: string | null;
  attachments?: Attachment[];
  created_at: string;
  /** Заполняется бэкендом не всегда — подписи автора может не быть. */
  author_name?: string;
  author_initials?: string;
}

export interface Shipment {
  id: number;
  lead_id: number;
  lead_name: string;
  status: string;
  route: string;
  carrier_id: number | null;
  carrier_name?: string | null;
  created_at: string;
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

export interface Carrier {
  id: number;
  name: string;
  inn: string;
  is_active: boolean;
}

export interface DashboardStats {
  leads_total: number;
  leads_archived: number;
  shipments_total: number;
  users_total: number;
  funnel: { id: number; name: string; count: number }[];
}

export interface Pager {
  position: number;
  total: number;
  prev_id: number | null;
  next_id: number | null;
}
