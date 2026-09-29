export interface DashboardStats {
  leads_total: number;
  leads_archived: number;
  shipments_total: number;
  users_total: number;
  funnel: { id: number; name: string; count: number }[];
}

export const dashboardStats: DashboardStats = {
  leads_total: 18,
  leads_archived: 1,
  shipments_total: 8,
  users_total: 5,
  funnel: [
    { id: 1, name: "Новый", count: 4 },
    { id: 2, name: "Квалификация", count: 4 },
    { id: 3, name: "Переговоры", count: 4 },
    { id: 4, name: "Договор", count: 3 },
    { id: 5, name: "Выиграно", count: 2 },
  ],
};
