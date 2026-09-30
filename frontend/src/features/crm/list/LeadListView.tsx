// Списочное представление лидов в стиле Odoo 17: сортируемые заголовки,
// чекбокс выбора в строке, панель действий сверху, группировка и подсветка
// выбранных строк. Данные статичные, запросов нет.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import type { Lead } from "@/shared/types";
import { StarRating } from "../board/StarRating";

const LIST_COLUMNS = 8; // чекбокс + 7 колонок данных
const ROWS_PER_PAGE = 80;

type SortKey =
  | "name"
  | "inn"
  | "logist_contact"
  | "tags"
  | "assigned_to_email"
  | "stage_name"
  | "priority";

interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

const SORT_ACCESSORS: Record<SortKey, (lead: Lead) => string | number> = {
  name: (l) => l.name,
  inn: (l) => l.inn,
  logist_contact: (l) => l.logist_contact,
  tags: (l) => (l.tags ?? []).map((t) => t.name).join(", "),
  assigned_to_email: (l) => l.assigned_to_email || "",
  stage_name: (l) => l.stage_name,
  priority: (l) => l.priority,
};

function compareLeads(a: Lead, b: Lead, sort: SortState): number {
  const get = SORT_ACCESSORS[sort.key];
  const av = get(a);
  const bv = get(b);
  let cmp: number;
  if (typeof av === "number" && typeof bv === "number") {
    cmp = av - bv;
  } else {
    cmp = String(av).localeCompare(String(bv), "ru", { sensitivity: "base" });
  }
  if (cmp === 0) cmp = a.id - b.id;
  return sort.dir === "asc" ? cmp : -cmp;
}

function ListTh({
  children,
  className = "",
  numeric = false,
  sortKey,
  sort,
  onSort,
}: {
  children: React.ReactNode;
  className?: string;
  numeric?: boolean;
  sortKey?: SortKey;
  sort?: SortState | null;
  onSort?: (key: SortKey) => void;
}) {
  const active = sortKey && sort?.key === sortKey;
  const content = (
    <span
      className={`inline-flex max-w-full items-center gap-1 align-middle ${
        sortKey ? "cursor-pointer select-none" : "cursor-default"
      }`}
    >
      <span className="truncate">{children}</span>
      {sortKey && (
        <span
          aria-hidden="true"
          className={`shrink-0 text-[9px] leading-none ${
            active
              ? "text-odoo-action"
              : "text-odoo-text-light opacity-0 group-hover:opacity-100"
          }`}
        >
          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "▲"}
        </span>
      )}
    </span>
  );
  return (
    <th
      scope="col"
      aria-sort={
        active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined
      }
      className={`group sticky top-0 z-10 bg-odoo-bg px-2 py-1.5 align-middle text-[13px] font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))] ${
        numeric ? "text-right" : "text-left"
      } ${className}`}
    >
      {sortKey && onSort ? (
        <button
          type="button"
          className={`block max-w-full truncate hover:text-odoo-action ${
            active ? "font-semibold text-odoo-action" : ""
          }`}
          onClick={() => onSort(sortKey)}
        >
          {content}
        </button>
      ) : (
        content
      )}
    </th>
  );
}

export function LeadListView({
  leads,
  groupBy,
}: {
  leads: Lead[];
  /** Повторяет меню группировки канбана: строки группируются так же. */
  groupBy?: "stage" | "assigned" | "";
}) {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(ROWS_PER_PAGE);
  const [sort, setSort] = useState<SortState | null>(null);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());

  const sorted = useMemo(() => {
    const all = [...leads];
    if (sort) all.sort((a, b) => compareLeads(a, b, sort));
    return all;
  }, [leads, sort]);

  const groups = useMemo(() => {
    if (!groupBy) return [{ key: "", title: "", items: sorted }];
    const map = new Map<string, Lead[]>();
    for (const l of sorted) {
      const key =
        groupBy === "assigned"
          ? l.assigned_to_email || "Не назначен"
          : l.stage_name || "Без этапа";
      const list = map.get(key);
      if (list) list.push(l);
      else map.set(key, [l]);
    }
    return Array.from(map, ([title, items]) => ({ key: title, title, items }));
  }, [sorted, groupBy]);

  const shownIds = useMemo(() => {
    const ids: number[] = [];
    let budget = visible;
    for (const g of groups) {
      for (const l of g.items.slice(0, Math.max(budget, 0))) ids.push(l.id);
      budget -= g.items.length;
    }
    return ids;
  }, [groups, visible]);

  const allShownSelected =
    shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null; // третий клик сбрасывает сортировку, как каретка в Odoo
    });
  }

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shownIds.forEach((id) => next.delete(id));
      else shownIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const selectedCount = selected.size;

  const headRow = (
    <tr>
      <th
        scope="col"
        className="sticky top-0 z-10 w-[38px] bg-odoo-bg px-0 py-1.5 shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]"
      >
        <input
          type="checkbox"
          checked={allShownSelected}
          onChange={toggleAll}
          aria-label="Выбрать все видимые лиды"
          className="h-3.5 w-3.5 accent-[rgb(var(--odoo-primary))]"
        />
      </th>
      <ListTh sortKey="name" sort={sort} onSort={toggleSort} className="pl-4">
        Название
      </ListTh>
      <ListTh sortKey="inn" sort={sort} onSort={toggleSort}>
        ИНН
      </ListTh>
      <ListTh sortKey="logist_contact" sort={sort} onSort={toggleSort}>
        Контакт
      </ListTh>
      <ListTh sortKey="tags" sort={sort} onSort={toggleSort}>
        Теги
      </ListTh>
      <ListTh sortKey="assigned_to_email" sort={sort} onSort={toggleSort}>
        Ответственный
      </ListTh>
      <ListTh sortKey="stage_name" sort={sort} onSort={toggleSort}>
        Этап
      </ListTh>
      <ListTh
        sortKey="priority"
        sort={sort}
        onSort={toggleSort}
        className="pr-4"
        numeric
      >
        Приоритет
      </ListTh>
    </tr>
  );

  function renderRows(items: Lead[]) {
    return items.map((lead) => (
      <tr
        key={lead.id}
        className={`cursor-pointer border-b border-odoo-border-light ${
          selected.has(lead.id)
            ? "bg-odoo-accent-soft"
            : "bg-odoo-surface hover:bg-odoo-surface-hover"
        }`}
        onClick={() => navigate(`/crm/leads/${lead.id}`)}
      >
        <td className="px-0 py-1 pl-2" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected.has(lead.id)}
            onChange={() => toggleRow(lead.id)}
            aria-label={`Выбрать лид «${lead.name}»`}
            className="h-3.5 w-3.5 accent-[rgb(var(--odoo-primary))]"
          />
        </td>
        <td className="truncate px-2 py-1 pl-4" title={lead.name}>
          {lead.name}
          {lead.is_archived && (
            <span className="ml-1.5 rounded-sm bg-odoo-danger/10 px-1 text-[10px] font-normal text-odoo-danger">
              Архив
            </span>
          )}
        </td>
        <td className="truncate px-2 py-1">{lead.inn}</td>
        <td
          className="truncate px-2 py-1 text-odoo-text-muted"
          title={lead.logist_contact || undefined}
        >
          {lead.logist_contact || "—"}
        </td>
        <td className="overflow-hidden px-2 py-1">
          {lead.tags?.length > 0 ? (
            <span className="flex flex-nowrap items-center gap-1 overflow-hidden">
              {lead.tags.map((tag) => (
                <span
                  key={tag.id}
                  title={tag.name}
                  className="inline-block max-w-[110px] shrink-0 truncate rounded-full bg-odoo-chip px-2 py-0.5 text-[11px] font-normal leading-[14px] text-odoo-chip-text"
                >
                  {tag.name}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-odoo-text-light">—</span>
          )}
        </td>
        <td className="px-2 py-1">
          <span className="flex items-center gap-1.5 overflow-hidden">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-odoo-primary text-[9px] font-semibold text-white">
              {ownerInitials(lead)}
            </span>
            <span
              className="truncate"
              title={lead.assigned_to_email || "Не назначен"}
            >
              {ownerLabel(lead) || "Не назначен"}
            </span>
          </span>
        </td>
        <td className="truncate px-2 py-1" title={lead.stage_name}>
          {lead.stage_name}
        </td>
        <td className="px-2 py-1 pr-4 text-right">
          <StarRating value={lead.priority} />
        </td>
      </tr>
    ));
  }

  const pagedGroups: { key: string; title: string; items: Lead[] }[] = [];
  let budget = visible;
  for (const g of groups) {
    if (budget <= 0) break;
    pagedGroups.push({ ...g, items: g.items.slice(0, budget) });
    budget -= g.items.length;
  }
  const shownCount = pagedGroups.reduce((n, g) => n + g.items.length, 0);
  const hidden = leads.length - shownCount;

  return (
    <div className="h-[calc(100dvh-var(--odoo-record-control-panel-height))] min-h-0 overflow-auto overscroll-contain border-t border-odoo-border-light bg-odoo-bg [scrollbar-gutter:stable]">
      {selectedCount > 0 && (
        <div className="sticky top-0 z-20 flex min-h-[38px] items-center gap-3 border-b border-odoo-border-light bg-odoo-surface px-4 py-1.5 text-[13px] shadow-xs">
          <span className="font-medium text-odoo-text">
            Выбрано записей: {selectedCount}
          </span>
          <button
            type="button"
            className="rounded-[3px] border border-odoo-border bg-odoo-surface px-2.5 py-1 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg"
            onClick={() => setSelected(new Set())}
          >
            Снять выделение
          </button>
        </div>
      )}
      <table className="w-full min-w-[1180px] table-fixed border-collapse text-[13px] leading-[18px] text-odoo-text [font-variant-numeric:tabular-nums]">
        <colgroup>
          <col />
          <col />
          <col className="w-[120px]" />
          <col className="w-[190px]" />
          <col className="w-[190px]" />
          <col className="w-[150px]" />
          <col className="w-[80px]" />
          <col className="w-[110px]" />
        </colgroup>
        <thead>{headRow}</thead>

        {leads.length === 0 && (
          <tbody>
            <tr>
              <td
                colSpan={LIST_COLUMNS}
                className="bg-odoo-surface px-4 py-12 text-center text-[13px] text-odoo-text-muted"
              >
                Нет лидов. Нажмите{" "}
                <span className="font-medium text-odoo-text">Новый</span>, чтобы
                создать первый.
              </td>
            </tr>
          </tbody>
        )}

        {pagedGroups.map((g) => (
          <tbody key={g.key || "__all"}>
            {g.title && (
              <tr className="border-b border-odoo-border-light bg-odoo-bg">
                <td colSpan={LIST_COLUMNS} className="px-4 py-1.5">
                  <span className="text-[13px] font-semibold text-odoo-text">
                    {g.title}
                  </span>
                  <span className="ml-2 text-[12px] text-odoo-text-muted">
                    ({g.items.length})
                  </span>
                </td>
              </tr>
            )}
            {renderRows(g.items)}
          </tbody>
        ))}

        {hidden > 0 && (
          <tbody>
            <tr>
              <td colSpan={LIST_COLUMNS} className="bg-odoo-surface px-4 py-2">
                <button
                  type="button"
                  onClick={() => setVisible((n) => n + ROWS_PER_PAGE)}
                  className="text-[13px] text-odoo-action hover:underline"
                >
                  Показать ещё {Math.min(ROWS_PER_PAGE, hidden)} из{" "}
                  {leads.length}
                </button>
              </td>
            </tr>
          </tbody>
        )}
      </table>
    </div>
  );
}
