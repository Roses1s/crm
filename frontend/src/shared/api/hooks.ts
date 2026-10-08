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
export type { ListResult } from "./hooks/shared";
