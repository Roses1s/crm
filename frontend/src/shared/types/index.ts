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
  leads_count?: number;
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
  logist_email: string | null;
  logist_contact: string;
  logist_phone: string;
  credit_limit: string;
  first_call_date: string | null;
  next_call_date: string | null;
  priority: number;
  stage: number;
  stage_name: string;
  tags: Tag[];
  assigned_to: number | null;
  assigned_to_email?: string;
  assigned_to_name?: string;
  is_archived: boolean;
}

export interface TimelineEntry {
  id: string;
  type: "note" | "history" | "message" | "activity";
  author_name: string;
  author_initials: string;
  body: string;
  /** Подпись отслеживаемого поля, например «Этапы лидов» (только для истории). */
  field_label?: string;
  old_value?: string;
  new_value?: string;
  /** Файлы, приложенные к записи. */
  attachments?: Attachment[];
  created_at: string;
}

export interface Attachment {
  id: number;
  name: string;
  size: number;
  content_type: string;
  uploaded_by: number | null;
  uploaded_by_name: string;
  created_at: string;
}

export interface Shipment {
  id: number;
  lead: number;
  lead_name: string;
  status: string;
  city_loading: string;
  city_unloading: string;
  route: string;
  carrier: number | null;
  carrier_name?: string;
  created_at: string;
}

export interface Carrier {
  id: number;
  name: string;
  inn: string;
  is_active: boolean;
}
