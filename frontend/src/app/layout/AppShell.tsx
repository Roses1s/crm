import type { ReactNode } from "react";
import { ChevronDown, LayoutGrid, List, Search, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { Navbar } from "@/app/layout/Navbar";

/**
 * Каркас приложения: Navbar + ControlPanel + Toolbar.
 *
 * ControlPanel — общая шапка страницы: заголовок, поиск, кнопка «Новый»,
 * переключатель «канбан/список» и необязательный выпадающий список под
 * строкой поиска (через него админ открывает доску сотрудника).
 */

export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <div className="text-sm text-odoo-text-muted">
      {items.map((item, i) => (
        <span key={`${item}-${i}`}>
          {i > 0 && <span className="mx-1.5 text-odoo-text-light">/</span>}
          <span
            className={
              i === items.length - 1 ? "font-medium text-odoo-text" : ""
            }
          >
            {item}
          </span>
        </span>
      ))}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-odoo-border-light bg-odoo-surface px-3 py-1">
      {children}
    </div>
  );
}

export function ControlPanel({
  title = "Лиды",
  crumbs,
  status,
  cog,
  stats,
  pager,
  onNew,
  children,
  search,
  onSearch,
  searchSuggestions,
  onSettings,
  createTo,
  view,
  onView,
  count,
}: {
  title?: string;
  crumbs?: { label: string; to?: string }[];
  status?: ReactNode;
  cog?: ReactNode;
  stats?: ReactNode;
  pager?: ReactNode;
  onNew?: () => void;
  children?: ReactNode;
  search?: string;
  onSearch?: (value: string) => void;
  /** Выпадающий список под строкой поиска (например, доски сотрудников). */
  searchSuggestions?: ReactNode;
  onSettings?: () => void;
  /** Ссылка кнопки «Новый» — вместо мутации просто переход. */
  createTo?: string;
  view?: "kanban" | "list";
  onView?: (v: "kanban" | "list") => void;
  count?: number;
}) {
  return (
    <div className="sticky top-10 z-30 shrink-0 border-b border-odoo-border-light bg-odoo-surface">
      <div className="relative flex min-h-14 flex-wrap items-center gap-2 px-4 py-1 md:flex-nowrap md:py-0">
        {createTo && (
          <Link
            to={createTo}
            className="inline-flex h-8 items-center rounded-[3px] bg-odoo-primary-soft px-3 text-[13px] font-medium text-odoo-primary-soft-text transition-colors hover:opacity-90"
          >
            Новый
          </Link>
        )}
        {onNew && (
          <button
            type="button"
            onClick={onNew}
            className="inline-flex h-8 shrink-0 items-center rounded-[4px] border border-odoo-border bg-odoo-surface px-3 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg"
          >
            Новый
          </button>
        )}
        {crumbs && crumbs.length > 0 ? (
          <nav
            aria-label="Хлебные крошки"
            className="flex min-w-0 flex-col justify-center"
          >
            {crumbs.length > 1 && (
              <span className="flex items-center gap-1 text-[11px] leading-[14px]">
                {crumbs.slice(0, -1).map((crumb, i) => (
                  <span
                    key={`${crumb.label}-${i}`}
                    className="flex items-center gap-1"
                  >
                    {i > 0 && <span className="text-odoo-text-light">/</span>}
                    {crumb.to ? (
                      <Link
                        to={crumb.to}
                        className="text-odoo-action hover:underline"
                      >
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="text-odoo-text-muted">
                        {crumb.label}
                      </span>
                    )}
                  </span>
                ))}
              </span>
            )}
            <span className="flex min-w-0 items-center gap-1">
              <span className="truncate text-[14px] font-medium leading-[18px] text-odoo-text">
                {crumbs[crumbs.length - 1].label}
              </span>
              {cog}
            </span>
          </nav>
        ) : (
          <span className="text-[14px] font-medium leading-none text-odoo-text">
            {title}
          </span>
        )}
        {status}
        {stats && (
          <div className="pointer-events-none absolute inset-x-0 hidden justify-center lg:flex">
            <div className="pointer-events-auto flex items-center gap-2">
              {stats}
            </div>
          </div>
        )}
        {onSettings && (
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text"
            onClick={onSettings}
            title="Настройки"
            aria-label="Настройки"
          >
            <Settings className="h-4 w-4" />
          </button>
        )}
        {onSearch && (
          <div className="pointer-events-none order-last flex w-full justify-center md:absolute md:inset-x-0 md:order-none md:w-auto">
            <div className="pointer-events-auto relative w-full md:w-[min(100%,600px)]">
              <div className="flex h-8 w-full items-stretch overflow-hidden rounded-[3px] border border-odoo-border bg-odoo-surface-sunken shadow-xs transition-[border-color,box-shadow] focus-within:border-odoo-accent-line/70 focus-within:ring-1 focus-within:ring-odoo-accent-line/20">
                <span className="flex items-center pl-3 pr-2">
                  <Search className="h-4 w-4 shrink-0 text-odoo-search-icon" />
                </span>
                <input
                  value={search ?? ""}
                  onChange={(e) => onSearch(e.target.value)}
                  placeholder="Поиск..."
                  aria-label="Поиск лидов"
                  className="min-w-0 flex-1 bg-transparent pr-2 text-[13px] outline-none placeholder:text-odoo-search-placeholder"
                />
                {onSettings && (
                  <button
                    type="button"
                    className="flex w-9 shrink-0 items-center justify-center border-l border-odoo-search-divider text-odoo-search-action hover:bg-odoo-search-action-hover"
                    onClick={onSettings}
                    title="Параметры поиска"
                    aria-label="Параметры поиска"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                )}
              </div>
              {searchSuggestions}
            </div>
          </div>
        )}
        <div className="relative z-10 ml-auto flex items-center gap-1">
          {pager}
          {typeof count === "number" && count > 0 && (
            <span
              className="mr-1 whitespace-nowrap text-[13px] leading-none text-odoo-text-muted [font-variant-numeric:tabular-nums]"
              aria-label={`Записей: ${count}`}
            >
              1-{count} / {count}
            </span>
          )}
          {onView && (
            <span className="mr-1 inline-flex h-8 overflow-hidden rounded-[3px] border border-odoo-border bg-odoo-surface-sunken">
              <button
                type="button"
                className={`inline-flex w-8 items-center justify-center border-r border-odoo-border transition-colors ${view !== "list" ? "bg-odoo-accent-soft text-odoo-action" : "text-odoo-text-muted hover:bg-odoo-bg"}`}
                onClick={() => onView("kanban")}
                title="Канбан"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={`inline-flex w-8 items-center justify-center transition-colors ${view === "list" ? "bg-odoo-accent-soft text-odoo-action" : "text-odoo-text-muted hover:bg-odoo-bg"}`}
                onClick={() => onView("list")}
                title="Список"
              >
                <List className="h-4 w-4" />
              </button>
            </span>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-odoo-bg">
      <Navbar />
      {children}
    </div>
  );
}
