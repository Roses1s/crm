import { z } from "zod";

/**
 * Проверяемые форматы ответов API.
 *
 * Типы приложения выводятся из этих же схем: компилятор и проверка во время
 * работы опираются на одно описание, а не на отдельный интерфейс и приведение
 * JSON к `T`.
 */

const idSchema = z.number().int().positive();
const integerSchema = z.number().int();
const nullableTextSchema = z.string().nullable();
const timestampSchema = z.string().datetime({ offset: true });

export const roleSchema = z.enum(["admin", "manager"]);
export type Role = z.infer<typeof roleSchema>;

export const accessTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().int().positive(),
});
export type AccessTokenResponse = z.infer<typeof accessTokenResponseSchema>;

export const userSchema = z.object({
  id: idSchema,
  email: z.string().email(),
  first_name: z.string(),
  last_name: z.string(),
  role: roleSchema,
  is_active: z.boolean(),
});
export type User = z.infer<typeof userSchema>;

export const metaSchema = z.object({ margin_deduction_rate: z.string() });
export type Meta = z.infer<typeof metaSchema>;

export const launcherAppSchema = z.object({
  id: idSchema,
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  icon: z.string(),
  route: z.string(),
  min_role: roleSchema,
});
export type LauncherApp = z.infer<typeof launcherAppSchema>;

export const stageSchema = z.object({
  id: idSchema,
  name: z.string(),
  sequence: integerSchema,
  color: z.string(),
});
export type Stage = z.infer<typeof stageSchema>;

export const tagSchema = z.object({
  id: idSchema,
  name: z.string(),
  color: z.string(),
});
export type Tag = z.infer<typeof tagSchema>;

export const lossReasonSchema = z.object({ id: idSchema, name: z.string() });
export type LossReason = z.infer<typeof lossReasonSchema>;

export const leadSchema = z.object({
  id: idSchema,
  name: z.string(),
  inn: z.string(),
  logist_contact: z.string(),
  logist_phone: z.string(),
  logist_email: nullableTextSchema,
  accountant_name: nullableTextSchema,
  priority: z.number().int().min(0).max(3),
  is_archived: z.boolean(),
  loss_reason_id: idSchema.nullable(),
  loss_reason_name: nullableTextSchema,
  stage_id: idSchema,
  stage_name: z.string(),
  assigned_to_id: idSchema.nullable(),
  assigned_to_email: nullableTextSchema,
  assigned_to_name: nullableTextSchema,
  tags: z.array(tagSchema),
  created_at: timestampSchema,
  updated_at: timestampSchema,
});
export type Lead = z.infer<typeof leadSchema>;

/**
 * У чужого активного клиента персональные поля приходят пустыми (`null`);
 * публичные поля, право открытия и дата изменения проверяются всегда.
 */
export const customerSchema = z.object({
  id: idSchema,
  name: z.string(),
  inn: z.string(),
  assigned_to_id: idSchema.nullable(),
  assigned_to_name: nullableTextSchema,
  is_archived: z.boolean(),
  can_open: z.boolean(),
  loss_reason_name: nullableTextSchema,
  logist_contact: nullableTextSchema,
  logist_phone: nullableTextSchema,
  logist_email: nullableTextSchema,
  priority: z.number().int().min(0).max(3).nullable(),
  stage_name: nullableTextSchema,
  tags: z.array(tagSchema),
  updated_at: timestampSchema,
});
export type Customer = z.infer<typeof customerSchema>;

export const attachmentSchema = z.object({
  id: idSchema,
  name: z.string(),
  size: z.number().int().nonnegative(),
  content_type: z.string(),
  uploaded_by_name: z.string(),
  created_at: timestampSchema,
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const timelineEntrySchema = z.object({
  id: idSchema,
  type: z.enum(["note", "history", "message"]),
  body: z.string(),
  field_label: nullableTextSchema,
  old_value: nullableTextSchema,
  new_value: nullableTextSchema,
  is_stage_change: z.boolean(),
  attachments: z.array(attachmentSchema),
  created_at: timestampSchema,
  author_name: z.string(),
  author_initials: z.string(),
  author_id: idSchema.nullable(),
});
export type TimelineEntry = z.infer<typeof timelineEntrySchema>;

export const shipmentTotalsSchema = z.object({
  margin: z.string(),
  customer_total: z.string(),
});
export type ShipmentTotals = z.infer<typeof shipmentTotalsSchema>;

const shipmentStatusSchema = z.enum(["new", "checked", "loaded", "unloaded"]);
const transportTypeSchema = z.enum(["ft_20", "ft_40", "ref", "tent", "gazel", "other"]);
const taxRateSchema = z.enum(["vat_22", "no_vat", "vat_0"]);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const decimalTextSchema = z.string();
const nullableDecimalSchema = decimalTextSchema.nullable();

export const shipmentSchema = z.object({
  id: idSchema,
  number: z.string(),
  lead_id: idSchema,
  lead_name: z.string(),
  seller_name: nullableTextSchema,
  status: shipmentStatusSchema,
  transport_type: transportTypeSchema,
  route: z.string(),
  address_loading: z.string(),
  address_unloading: z.string(),
  contact_loading_name: z.string(),
  contact_loading_phone: z.string(),
  contact_unloading_name: z.string(),
  contact_unloading_phone: z.string(),
  cargo_weight: nullableDecimalSchema,
  cargo_volume: nullableDecimalSchema,
  comment: z.string(),
  customer_price: nullableDecimalSchema,
  customer_tax: taxRateSchema,
  carrier_price: nullableDecimalSchema,
  carrier_tax: taxRateSchema,
  customer_address: z.string(),
  customer_contact: z.string(),
  customer_signer: z.string(),
  loading_cities: z.array(z.string()),
  loading_date_from: dateSchema.nullable(),
  loading_date_to: dateSchema.nullable(),
  loading_time_from: z.string(),
  loading_time_to: z.string(),
  unloading_cities: z.array(z.string()),
  unloading_date_from: dateSchema.nullable(),
  unloading_date_to: dateSchema.nullable(),
  unloading_time_from: z.string(),
  unloading_time_to: z.string(),
  carrier_name: z.string(),
  carrier_inn: z.string(),
  carrier_contact: z.string(),
  vehicle: z.string(),
  vehicle_number: z.string(),
  has_trailer: z.boolean(),
  trailer_number: z.string(),
  driver_name: z.string(),
  driver_phone: z.string(),
  driver_passport: z.string(),
  carrier_signer: z.string(),
  cargo_type: z.string(),
  cargo_packaging: z.string(),
  capacity: nullableDecimalSchema,
  body_type: z.array(z.string()),
  loading_method: z.array(z.string()),
  tags: z.array(tagSchema),
  created_at: timestampSchema,
});
export type Shipment = z.infer<typeof shipmentSchema>;

export const shipmentListItemSchema = z.object({
  id: idSchema,
  number: z.string(),
  lead_id: idSchema,
  lead_name: z.string(),
  tags: z.array(tagSchema),
  seller_name: nullableTextSchema,
  status: shipmentStatusSchema,
  route: z.string(),
  carrier_name: z.string(),
  created_at: timestampSchema,
  margin: nullableDecimalSchema,
  customer_total: nullableDecimalSchema,
});
export type ShipmentListItem = z.infer<typeof shipmentListItemSchema>;

export const pagerSchema = z.object({
  position: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  prev_id: idSchema.nullable(),
  next_id: idSchema.nullable(),
});
export type Pager = z.infer<typeof pagerSchema>;

export const colleagueSchema = z.object({
  id: idSchema,
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
});
export type Colleague = z.infer<typeof colleagueSchema>;

export const voidResponseSchema = z.undefined();

export function arraySchema<T extends z.ZodType>(itemSchema: T) {
  return z.array(itemSchema);
}

/** Страница списка в формате, который возвращает FastAPI. */
export function pageSchema<T extends z.ZodType>(itemSchema: T) {
  return z.object({
    count: z.number().int().nonnegative(),
    next: z.number().int().positive().nullable(),
    previous: z.number().int().positive().nullable(),
    results: z.array(itemSchema),
  });
}

export const shipmentsPageSchema = pageSchema(shipmentListItemSchema).extend({
  totals: shipmentTotalsSchema,
});

export const backupInfoSchema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
});
export const backupsResponseSchema = z.object({
  storage: z.object({
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
    free_bytes: z.number().int().nonnegative(),
  }),
  results: z.array(backupInfoSchema),
  last_backup_at: timestampSchema.nullable(),
  age_hours: z.number().nonnegative().nullable(),
  is_stale: z.boolean(),
});
export type BackupsResponse = z.infer<typeof backupsResponseSchema>;

export const backupTaskResponseSchema = z.object({
  task_id: z.string().min(1),
  detail: z.string(),
});

export const loginAttemptSchema = z.object({
  id: idSchema,
  username: z.string(),
  ip_address: z.string(),
  attempt_time: z.string(),
  failures: z.number().int().positive(),
});
export type LoginAttempt = z.infer<typeof loginAttemptSchema>;
