import { format } from "date-fns";
import { Link, useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { useShipments } from "@/shared/api/hooks";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Новая", cls: "bg-odoo-tag-yellow-bg text-odoo-tag-yellow-text" },
  in_progress: { label: "В работе", cls: "bg-odoo-tag-blue-bg text-odoo-tag-blue-text" },
  in_transit: { label: "В пути", cls: "bg-odoo-tag-green-bg text-odoo-tag-green-text" },
  delivered: { label: "Доставлена", cls: "bg-odoo-tag-green-bg text-odoo-tag-green-text" },
  cancelled: { label: "Отменена", cls: "bg-odoo-tag-red-bg text-odoo-tag-red-text" },
};

/** Инициалы продавца для аватарки (до двух букв). */
function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Дата создания в формате «12.08.2026 11:55:53». */
function formatDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd.MM.yyyy HH:mm:ss");
}

/** Список заявок. Фильтр по статусу — в адресной строке и в запросе к API. */
export function ShipmentsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const { data: shipments = [], isLoading } = useShipments(status);

  const statusFilter = (
    <select
      className="h-8 rounded-[3px] border border-odoo-border bg-odoo-surface-sunken px-2 text-[13px] text-odoo-text-muted outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus/40"
      value={status}
      onChange={(e) => {
        const next = new URLSearchParams(params);
        if (e.target.value) next.set("status", e.target.value);
        else next.delete("status");
        setParams(next);
      }}
    >
      <option value="">Все статусы</option>
      {Object.entries(STATUS).map(([k, v]) => (
        <option key={k} value={k}>
          {v.label}
        </option>
      ))}
    </select>
  );

  return (
    <AppShell>
      <ControlPanel
        title="Заявки"
        status={statusFilter}
        count={shipments.length}
      />

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-odoo-surface-sunken text-odoo-text-muted">
            <tr className="border-b border-odoo-border">
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Номер</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Дата создания</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Продавец</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Клиент</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Маршрут</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Перевозчик</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Статус</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && shipments.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-odoo-text-muted">
                  Заявок нет.
                </td>
              </tr>
            )}
            {shipments.map((s) => {
              const st = STATUS[s.status] ?? STATUS.new;
              return (
                <tr
                  key={s.id}
                  className="border-b border-odoo-border-light bg-odoo-surface transition-colors hover:bg-odoo-bg"
                >
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link
                      className="font-medium text-odoo-action hover:underline"
                      to={`/shipments/${s.id}`}
                    >
                      {s.id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-odoo-text-muted">
                    {formatDate(s.created_at)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className="flex items-center gap-2">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] bg-odoo-avatar text-[10px] font-semibold text-white">
                        {initials(s.seller_name)}
                      </span>
                      <span className="text-odoo-text">{s.seller_name || "—"}</span>
                    </span>
                  </td>
                  <td className="px-3 py-2 text-odoo-text">{s.lead_name}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-odoo-text-muted">{s.route}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-odoo-text-muted">
                    {s.carrier_name || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span className={`inline-flex rounded-[10px] px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
