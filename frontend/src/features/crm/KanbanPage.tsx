import { ChevronDown, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { Column } from "@/features/crm/board/Column";
import { LeadListView } from "@/features/crm/list/LeadListView";
import { activeLeads } from "@/shared/mock/leads";
import { stages } from "@/shared/mock/stages";
import { tags } from "@/shared/mock/tags";

/**
 * Канбан лидов.
 *
 * Что осталось от оригинала: разметка панели управления, колонок и карточек,
 * переключатель канбан/список, сворачивание колонок, выпадашки фильтров.
 * Что убрано: загрузка данных, drag-and-drop и смена этапа, фильтрация через
 * query-параметры, создание этапов. Колонки заполняются моковым массивом.
 */

function Dropdown({
  label,
  children,
  active,
}: {
  label: string;
  children: React.ReactNode;
  active?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative min-w-0 px-1">
      <button
        type="button"
        className={`flex w-full items-center justify-between gap-2 rounded-[3px] px-2 py-1.5 text-[13px] ${active ? "bg-odoo-primary/10 font-medium text-odoo-action" : "text-odoo-text-muted hover:bg-odoo-bg"}`}
        onClick={() => setOpen((v) => !v)}
      >
        {label} <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            aria-label="Закрыть"
          />
          <div
            className="absolute left-0 z-50 mt-1 max-h-[360px] min-w-full overflow-y-auto rounded-[3px] border border-odoo-border bg-odoo-surface py-1 shadow-lg"
            onClick={() => setOpen(false)}
          >
            {children}
          </div>
        </>
      )}
    </div>
  );
}

export function KanbanPage() {
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [group, setGroup] = useState<"stage" | "assigned">("stage");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [folded, setFolded] = useState<number[]>([]);

  const leads = activeLeads;

  const groupColumns =
    group === "assigned"
      ? Array.from(new Set(leads.map((l) => l.assigned_to_email || "Не назначен"))).map(
          (email) => ({
            key: email,
            title: email,
            items: leads.filter((l) => (l.assigned_to_email || "Не назначен") === email),
          }),
        )
      : [];

  return (
    <AppShell>
      <ControlPanel
        title="Лиды"
        searchable
        createTo="/crm/leads/new"
        onSettings={() => setSettingsOpen((v) => !v)}
        view={view}
        onView={setView}
        count={view === "list" ? leads.length : undefined}
      >
        {settingsOpen && (
          <div className="absolute left-1/2 top-full z-40 grid w-[min(calc(100vw-1.5rem),600px)] -translate-x-1/2 grid-cols-2 divide-x divide-odoo-border-light rounded-b-[3px] border border-t-0 border-odoo-border bg-odoo-surface p-1 shadow-lg">
            <Dropdown label="Фильтры">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
              >
                Все приоритеты
              </button>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                >
                  {"★".repeat(n)}
                </button>
              ))}
              <div className="my-1 border-t border-odoo-border-light" />
              {stages.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                >
                  Этап: {s.name}
                </button>
              ))}
              <div className="my-1 border-t border-odoo-border-light" />
              {tags.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                >
                  Тег: {t.name}
                </button>
              ))}
              <div className="my-1 border-t border-odoo-border-light" />
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
              >
                Архив
              </button>
            </Dropdown>
            <Dropdown label="Группировка" active={group !== "stage"}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={() => setGroup("stage")}
              >
                По этапам
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={() => setGroup("assigned")}
              >
                По ответственному
              </button>
            </Dropdown>
          </div>
        )}
      </ControlPanel>

      {view === "list" && <LeadListView leads={leads} groupBy={group} />}

      {view !== "list" && (
        <div className="flex h-[calc(100dvh-90px)] min-h-0 snap-x snap-mandatory gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain border-t border-odoo-border-light bg-odoo-surface md:snap-none">
          {group === "stage"
            ? stages.map((stage) => (
                <Column
                  key={stage.id}
                  stage={stage}
                  leads={leads.filter((l) => l.stage === stage.id)}
                  folded={folded.includes(stage.id)}
                  onFold={() =>
                    setFolded((f) =>
                      f.includes(stage.id) ? f.filter((x) => x !== stage.id) : [...f, stage.id],
                    )
                  }
                />
              ))
            : groupColumns.map((col) => (
                <div
                  key={col.key}
                  className="flex h-full w-[325px] shrink-0 flex-col border-r border-odoo-border-light"
                >
                  <div className="mb-2 text-[13px] font-semibold">
                    {col.title}{" "}
                    <span className="font-normal text-odoo-text-muted">{col.items.length}</span>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-odoo-surface [scrollbar-gutter:stable]">
                    {col.items.map((lead) => (
                      <a
                        key={lead.id}
                        href={`/crm/leads/${lead.id}`}
                        className="overflow-hidden border-b border-odoo-border-light bg-odoo-surface px-2.5 py-2 hover:bg-odoo-surface-hover"
                      >
                        <span className="text-[15px] font-medium leading-5 text-odoo-text">
                          {lead.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-odoo-text-muted">
                          {lead.logist_contact || lead.name}
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
          {group === "stage" && (
            <div className="w-[200px] shrink-0 pt-1">
              <button
                type="button"
                className="flex items-center gap-1 pl-2 text-sm text-odoo-text-muted hover:text-odoo-text"
              >
                <Plus className="h-4 w-4" /> Добавить этап
              </button>
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
