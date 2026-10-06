import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { BoardSuggestions } from "@/features/crm/board/BoardSuggestions";
import { ListLimitNotice } from "@/shared/ui/list-limit-notice";
import { useMe, useShipments } from "@/shared/api/hooks";
import { EmployeeBanner } from "./employee-banner";
import { formatShipmentDate, SHIPMENT_STATUS } from "./shipment-status";
import { formatMoney } from "./money";

/** Инициалы продавца для аватарки (до двух букв). */
function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/** Список заявок. Фильтр по статусу и поиск — в адресной строке и в запросе к API. */
export function ShipmentsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const search = params.get("search") ?? "";
  const [searchInput, setSearchInput] = useState(search);
  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  // Админ может оставить в списке заявки одного сотрудника: его номер живёт
  // в адресе (?employee=N), ссылку можно переслать. Менеджеру отбор не
  // показываем — сервер на такой запрос всё равно ответит 403.
  const employeeParam = Number(params.get("employee"));
  const employeeId =
    isAdmin && Number.isInteger(employeeParam) && employeeParam > 0 ? employeeParam : null;
  const { data: shipmentsPage, isLoading } = useShipments(status, search, employeeId);
  const shipments = shipmentsPage?.items ?? [];
  const totals = shipmentsPage?.totals;

  // Поиск дебаунсим на 300мс и пишем в адресную строку с replace — как на
  // «Лидах» и «Клиентах» (KanbanPage/CustomersPage): иначе запрос к API
  // улетал бы на каждое нажатие клавиши, а история браузера забивалась бы
  // записью на каждый символ, ломая кнопку «Назад».
  useEffect(() => {
    const timer = setTimeout(() => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (searchInput) next.set("search", searchInput);
          else next.delete("search");
          return next;
        },
        { replace: true },
      );
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  /** Меняет один параметр адреса, не трогая остальные. */
  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  const statusFilter = (
    <select
      className="h-8 rounded-[3px] border border-odoo-border bg-odoo-surface-sunken px-2 text-[13px] text-odoo-text-muted outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus/40"
      value={status}
      onChange={(e) => setFilter("status", e.target.value)}
    >
      <option value="">Все статусы</option>
      {Object.entries(SHIPMENT_STATUS).map(([k, v]) => (
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
        count={shipmentsPage?.total ?? 0}
        search={searchInput}
        onSearch={setSearchInput}
        searchSuggestions={
          isAdmin ? (
            <BoardSuggestions
              query={searchInput}
              excludeUserId={employeeId}
              actionLabel="показать заявки"
              onPick={(userId) => {
                // Строку поиска очищаем: фамилия была нужна только чтобы
                // выбрать сотрудника из подсказок.
                setSearchInput("");
                setFilter("employee", String(userId));
              }}
            />
          ) : undefined
        }
      />

      <ListLimitNotice data={shipmentsPage} noun="заявок" />

      {employeeId !== null && (
        <EmployeeBanner userId={employeeId} onLeave={() => setFilter("employee", "")} />
      )}

      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-odoo-surface-sunken text-odoo-text-muted">
            <tr className="border-b border-odoo-border">
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Номер</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">
                Дата создания
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Продавец</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Клиент</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Перевозчик</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left font-semibold">Статус</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Маржа</th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right font-semibold">Всего</th>
            </tr>
          </thead>
          <tbody>
            {!isLoading && shipments.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-odoo-text-muted">
                  Заявок нет.
                </td>
              </tr>
            )}
            {shipments.map((s) => {
              const st = SHIPMENT_STATUS[s.status] ?? SHIPMENT_STATUS.new;
              return (
                <tr
                  key={s.id}
                  onClick={() => navigate(`/shipments/${s.id}`)}
                  className="cursor-pointer border-b border-odoo-border-light bg-odoo-surface transition-colors hover:bg-odoo-bg"
                >
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-odoo-action">
                    {/* Настоящая ссылка — держит клавиатурный фокус, открытие в
                        новой вкладке средней кнопкой/Ctrl-клик и «копировать
                        ссылку» по правому клику. Клик по ней не даёт событию
                        всплыть до <tr>, чтобы не навигировать дважды. */}
                    <Link
                      to={`/shipments/${s.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="hover:underline"
                    >
                      {s.number}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-odoo-text-muted">
                    {formatShipmentDate(s.created_at)}
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
                  <td className="whitespace-nowrap px-3 py-2 text-odoo-text-muted">
                    {s.carrier_name || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <span
                      className={`inline-flex rounded-[10px] px-2 py-0.5 text-[11px] font-medium ${st.cls}`}
                    >
                      {st.label}
                    </span>
                  </td>
                  {/* Маржу и «Всего» считает сервер — фронтенд только
                      форматирует (см. money.ts и models/shipment.py). */}
                  <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-odoo-text">
                    {formatMoney(s.margin)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-odoo-text">
                    <span className="block">{formatMoney(s.customer_total)}</span>
                    {/* Второй строкой — цена без НДС, приглушённо. */}
                    <span className="block text-[11px] text-odoo-text-muted">
                      без НДС {formatMoney(s.customer_total_net)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Строка итогов: суммы по всему текущему отбору (считает сервер по
              фильтру, а не по показанной странице — см. ShipmentTotals).
              Приклеена к низу прокрутки, чтобы итоги были видны всегда. */}
          {shipments.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 border-t border-odoo-border bg-odoo-surface-sunken">
              <tr>
                <td
                  colSpan={6}
                  className="whitespace-nowrap px-3 py-2 text-left font-semibold text-odoo-text-muted"
                >
                  Итого
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-odoo-text">
                  {formatMoney(totals?.margin)}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-odoo-text">
                  <span className="block font-semibold">{formatMoney(totals?.customer_total)}</span>
                  <span className="block text-[11px] text-odoo-text-muted">
                    без НДС {formatMoney(totals?.customer_total_net)}
                  </span>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </AppShell>
  );
}
