/**
 * Публичный вход к запросам и мутациям API.
 * Реализации разделены по областям, чтобы изменения одной страницы не
 * разрастались в общем файле. Импорт для компонентов сохранён прежним.
 */

export * from "./hooks/auth";
export * from "./hooks/reference";
export * from "./hooks/leads";
export * from "./hooks/attachments";
export * from "./hooks/shipments";
export * from "./hooks/admin";
export {
  CUSTOMER_PAGE_SIZE,
  KANBAN_PAGE_SIZE,
  LEAD_PAGE_SIZE,
  SHIPMENT_PAGE_SIZE,
} from "./hooks/shared";
export type { ListResult } from "./hooks/shared";
