import { Link, useSearchParams } from "react-router-dom";
import { AppShell, Breadcrumb, Toolbar } from "@/app/layout/AppShell";
import { useShipments } from "@/shared/api/hooks";
import { Button } from "@/shared/ui/button";

const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Новая", cls: "bg-odoo-tag-yellow-bg text-odoo-tag-yellow-text" },
  in_progress: { label: "В работе", cls: "bg-odoo-tag-blue-bg text-odoo-tag-blue-text" },
  in_transit: { label: "В пути", cls: "bg-odoo-tag-green-bg text-odoo-tag-green-text" },
  delivered: { label: "Доставлена", cls: "bg-odoo-tag-green-bg text-odoo-tag-green-text" },
  cancelled: { label: "Отменена", cls: "bg-odoo-tag-red-bg text-odoo-tag-red-text" },
};

/** Список заявок. Фильтр по статусу — в адресной строке и в запросе к API. */
export function ShipmentsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const { data: shipments = [], isLoading } = useShipments(status);

  return (
    <AppShell>
      <Breadcrumb items={["Заявки", "Все"]} />
      <Toolbar>
        <select
          className="rounded-[4px] border border-odoo-border px-2 py-1 text-sm text-odoo-text-muted"
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
        <span className="ml-auto" />
        <Link to="/shipments/new">
          <Button>+ Создать</Button>
        </Link>
      </Toolbar>
      <div className="overflow-x-auto p-4">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-odoo-bg text-xs font-semibold uppercase text-odoo-text-muted">
            <tr>
              <th className="p-2 text-left">№</th>
              <th className="p-2 text-left">Лид</th>
              <th className="p-2 text-left">Маршрут</th>
              <th className="p-2 text-left">Перевозчик</th>
              <th className="p-2 text-left">Статус</th>
              <th className="p-2 text-left">Дата</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && shipments.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-odoo-text-muted">
                  Заявок нет. Нажмите «Создать», чтобы добавить первую.
                </td>
              </tr>
            )}
            {shipments.map((s) => {
              const st = STATUS[s.status] ?? STATUS.new;
              return (
                <tr
                  key={s.id}
                  className="h-10 border-b border-odoo-border-light bg-odoo-surface hover:bg-odoo-bg"
                >
                  <td className="p-2">
                    <Link className="text-odoo-action" to={`/shipments/${s.id}`}>
                      {s.id}
                    </Link>
                  </td>
                  <td className="p-2">{s.lead_name}</td>
                  <td className="p-2">{s.route}</td>
                  <td className="p-2">{s.carrier_name || "—"}</td>
                  <td className="p-2">
                    <span className={`rounded-[4px] px-1.5 py-0.5 text-[11px] ${st.cls}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="p-2 text-odoo-text-muted">{s.created_at?.slice(0, 10)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
