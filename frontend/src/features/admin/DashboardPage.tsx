import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTheme } from "@/shared/lib/theme";
import { dashboardStats } from "@/shared/mock/dashboard";

export function DashboardPage() {
  // Recharts рисует по пропсам, поэтому тему графику передаём явно.
  const theme = useTheme();
  const grid = theme === "dark" ? "#2F3035" : "#E9ECEF";
  const bar = theme === "dark" ? "#825676" : "#714B67";
  const axis = theme === "dark" ? "#9A9AA0" : "#6C757D";

  const data = dashboardStats;

  return (
    <div>
      <h2 className="mb-4 text-odoo-text">Дашборд</h2>
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Лиды", data.leads_total],
          ["Архив", data.leads_archived],
          ["Заявки", data.shipments_total],
          ["Пользователи", data.users_total],
        ].map(([label, val]) => (
          <div
            key={String(label)}
            className="rounded-md border border-odoo-border-light bg-odoo-surface p-4 shadow-xs"
          >
            <div className="text-xs uppercase text-odoo-text-muted">{label}</div>
            <div className="mt-1 text-xl font-semibold">{val ?? "—"}</div>
          </div>
        ))}
      </div>
      <div className="h-72 rounded-md border border-odoo-border-light bg-odoo-surface p-4">
        <h3 className="mb-2">Воронка</h3>
        <ResponsiveContainer width="100%" height="90%">
          <BarChart data={data.funnel}>
            <CartesianGrid strokeDasharray="3 3" stroke={grid} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: axis }} stroke={grid} />
            <YAxis tick={{ fontSize: 11, fill: axis }} stroke={grid} />
            <Tooltip />
            <Bar dataKey="count" fill={bar} radius={4} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
