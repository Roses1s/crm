/**
 * Типы API выводятся из runtime-схем, которыми проверяются ответы сервера.
 * При изменении формы данных TypeScript и проверка во время работы используют
 * одно описание — `shared/api/schemas.ts`.
 */
export type {
  Attachment,
  BackupsResponse,
  Colleague,
  Customer,
  LauncherApp,
  Lead,
  LoginAttempt,
  LossReason,
  Meta,
  Pager,
  Role,
  Shipment,
  ShipmentListItem,
  ShipmentTotals,
  Stage,
  Tag,
  TimelineEntry,
  User,
} from "../api/schemas";
