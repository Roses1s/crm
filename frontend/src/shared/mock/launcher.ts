import type { LauncherApp } from "@/shared/types";

export const launcherApps: LauncherApp[] = [
  {
    id: 1,
    slug: "crm",
    name: "CRM",
    description: "Лиды, воронка продаж и карточки клиентов",
    icon: "Kanban",
    route: "/crm",
    min_role: "operator",
  },
  {
    id: 2,
    slug: "shipments",
    name: "Заявки",
    description: "Перевозки, маршруты и статусы отгрузок",
    icon: "Package",
    route: "/shipments",
    min_role: "operator",
  },
  {
    id: 3,
    slug: "admin",
    name: "Администрирование",
    description: "Отчёты, пользователи, перевозчики, безопасность",
    icon: "Settings",
    route: "/admin",
    min_role: "manager",
  },
];
