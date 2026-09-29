import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  defaultDropAnimationSideEffects,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from "@dnd-kit/core";
import { ChevronDown, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { BoardSwitcher } from "@/features/crm/board/BoardSwitcher";
import { Column } from "@/features/crm/board/Column";
import { LeadCard } from "@/features/crm/board/LeadCard";
import { LeadListView } from "@/features/crm/list/LeadListView";
import {
  useCanManage,
  useCreateStage,
  useLeads,
  useMe,
  useMoveLead,
  useStages,
  useTags,
} from "@/shared/api/hooks";
import type { Lead } from "@/shared/types";

const dropAnimation: DropAnimation = {
  duration: 160,
  easing: "ease-out",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.3" } },
  }),
};

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

/**
 * Канбан лидов.
 *
 * Фильтры и режим просмотра живут в адресной строке — ссылку на отфильтрованную
 * доску можно переслать коллеге. Перетаскивание карточки меняет этап на сервере
 * (оптимистично: карточка переезжает сразу, при ошибке возвращается назад).
 */
export function KanbanPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const canManage = useCanManage();

  const search = params.get("search") ?? "";
  const stageFilter = params.get("stage");
  const tagFilter = params.get("tags");
  const priorityFilter = params.get("priority");
  const archived = params.get("is_archived") === "true";
  const assignedFilter = params.get("assigned_to");
  // Админ может открыть доску сотрудника: номер лежит в адресе (?board=N).
  const boardParam = params.get("board");
  const group = params.get("group") === "assigned" ? "assigned" : "stage";
  const view = params.get("view") === "list" ? "list" : "kanban";

  const [searchInput, setSearchInput] = useState(search);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [folded, setFolded] = useState<number[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("crm-folded-stages") ?? "[]",
      ) as number[];
    } catch {
      return [];
    }
  });
  const [activeLead, setActiveLead] = useState<Lead | null>(null);
  const [newStage, setNewStage] = useState(false);
  const [stageName, setStageName] = useState("");

  useEffect(() => {
    localStorage.setItem("crm-folded-stages", JSON.stringify(folded));
  }, [folded]);

  // Поиск уходит на сервер с задержкой — иначе запрос на каждую букву.
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
  }, [searchInput, setParams]);

  const { data: me } = useMe();
  const isAdmin = me?.role === "admin";
  const boardUserId = isAdmin && boardParam ? Number(boardParam) : null;
  const { data: leads = [] } = useLeads({
    search,
    stage: stageFilter ? Number(stageFilter) : null,
    tag: tagFilter ? Number(tagFilter) : null,
    priority: priorityFilter ? Number(priorityFilter) : null,
    // На чужой доске показываем лиды её владельца.
    assigned: assignedFilter ? Number(assignedFilter) : boardUserId,
    archived,
  });
  const { data: stages = [] } = useStages(boardUserId);
  const { data: tags = [] } = useTags();
  const moveLead = useMoveLead();
  const createStage = useCreateStage();

  const filterActive = Boolean(
    stageFilter || tagFilter || priorityFilter || archived || assignedFilter,
  );

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  function onDragStart(event: DragStartEvent) {
    const id = Number(String(event.active.id).replace("lead-", ""));
    setActiveLead(leads.find((l) => l.id === id) ?? null);
  }

  function onDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over) return;

    const leadId = Number(String(active.id).replace("lead-", ""));
    let stageId: number | null = null;
    if (String(over.id).startsWith("stage-")) {
      stageId = Number(String(over.id).replace("stage-", ""));
    } else if (String(over.id).startsWith("lead-")) {
      const target = leads.find(
        (l) => l.id === Number(String(over.id).replace("lead-", "")),
      );
      stageId = target?.stage_id ?? null;
    }

    const lead = leads.find((l) => l.id === leadId);
    if (lead && stageId && lead.stage_id !== stageId) {
      moveLead.mutate({ id: leadId, stage_id: stageId });
    }
  }

  const groupColumns = useMemo(
    () =>
      Array.from(
        new Set(leads.map((l) => l.assigned_to_email || "Не назначен")),
      ).map((email) => ({
        key: email,
        title: email,
        items: leads.filter(
          (l) => (l.assigned_to_email || "Не назначен") === email,
        ),
      })),
    [leads],
  );

  return (
    <AppShell>
      <ControlPanel
        title="Лиды"
        search={searchInput}
        onSearch={setSearchInput}
        createTo="/crm/leads/new"
        onSettings={() => setSettingsOpen((v) => !v)}
        view={view}
        onView={(v) => setFilter("view", v === "list" ? "list" : "")}
        count={view === "list" ? leads.length : undefined}
      >
        {settingsOpen && (
          <div className="absolute left-1/2 top-full z-40 grid w-[min(calc(100vw-1.5rem),600px)] -translate-x-1/2 grid-cols-2 divide-x divide-odoo-border-light rounded-b-[3px] border border-t-0 border-odoo-border bg-odoo-surface p-1 shadow-lg">
            <Dropdown label="Фильтры" active={filterActive}>
              <button
                type="button"
                className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg ${assignedFilter ? "font-medium text-odoo-action" : ""}`}
                onClick={() =>
                  setFilter(
                    "assigned_to",
                    assignedFilter ? "" : String(me?.id ?? ""),
                  )
                }
              >
                {assignedFilter ? "Показать все" : "Мои лиды"}
              </button>
              <div className="my-1 border-t border-odoo-border-light" />
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={() => setFilter("priority", "")}
              >
                Все приоритеты
              </button>
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                  onClick={() => setFilter("priority", String(n))}
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
                  onClick={() => setFilter("stage", String(s.id))}
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
                  onClick={() => setFilter("tags", String(t.id))}
                >
                  Тег: {t.name}
                </button>
              ))}
              <div className="my-1 border-t border-odoo-border-light" />
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={() => setFilter("is_archived", archived ? "" : "true")}
              >
                {archived ? "Скрыть архив" : "Архив"}
              </button>
              {filterActive && (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm text-odoo-action hover:bg-odoo-bg"
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    [
                      "priority",
                      "stage",
                      "tags",
                      "is_archived",
                      "assigned_to",
                    ].forEach((k) => next.delete(k));
                    setParams(next);
                  }}
                >
                  Сбросить
                </button>
              )}
            </Dropdown>
            <Dropdown label="Группировка" active={group !== "stage"}>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={() => setFilter("group", "")}
              >
                По этапам
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={() => setFilter("group", "assigned")}
              >
                По ответственному
              </button>
            </Dropdown>
          </div>
        )}
      </ControlPanel>

      {isAdmin && (
        <BoardSwitcher
          boardUserId={boardUserId}
          onChange={(userId) =>
            setFilter("board", userId ? String(userId) : "")
          }
        />
      )}

      {moveLead.isError && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[4px] border border-odoo-danger/30 bg-red-50 px-3 py-2 text-sm text-odoo-danger"
        >
          Не удалось переместить лид. Изменение отменено.
        </div>
      )}

      {view === "list" && (
        <LeadListView
          leads={leads}
          groupBy={group === "assigned" ? "assigned" : "stage"}
        />
      )}

      {view !== "list" && (
        <div className="flex h-[calc(100dvh-90px)] min-h-0 snap-x snap-mandatory gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain border-t border-odoo-border-light bg-odoo-surface md:snap-none">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={onDragStart}
            onDragCancel={() => setActiveLead(null)}
            onDragEnd={onDragEnd}
          >
            {group === "stage"
              ? stages.map((stage) => (
                  <Column
                    key={stage.id}
                    stage={stage}
                    leads={leads.filter((l) => l.stage_id === stage.id)}
                    canManage={canManage}
                    folded={folded.includes(stage.id)}
                    onFold={() =>
                      setFolded((f) =>
                        f.includes(stage.id)
                          ? f.filter((x) => x !== stage.id)
                          : [...f, stage.id],
                      )
                    }
                    allStages={stages}
                  />
                ))
              : groupColumns.map((col) => (
                  <div
                    key={col.key}
                    className="flex h-full w-[325px] shrink-0 flex-col border-r border-odoo-border-light"
                  >
                    <div className="bg-odoo-column-head px-2.5 py-2 text-[13px] font-semibold">
                      {col.title}{" "}
                      <span className="font-normal text-odoo-text-muted">
                        {col.items.length}
                      </span>
                    </div>
                    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-odoo-surface [scrollbar-gutter:stable]">
                      {col.items.map((lead) => (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => navigate(`/crm/leads/${lead.id}`)}
                          className="overflow-hidden border-b border-odoo-border-light bg-odoo-surface px-2.5 py-2 text-left hover:bg-odoo-surface-hover"
                        >
                          <span className="text-[15px] font-medium leading-5 text-odoo-text">
                            {lead.name}
                          </span>
                          <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-odoo-text-muted">
                            {lead.logist_contact || lead.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
            <DragOverlay dropAnimation={dropAnimation} zIndex={50}>
              {activeLead ? <LeadCard lead={activeLead} isOverlay /> : null}
            </DragOverlay>
          </DndContext>

          {canManage && group === "stage" && (
            <div className="w-[200px] shrink-0 p-2">
              {newStage ? (
                <input
                  autoFocus
                  className="w-full rounded-[4px] border border-odoo-border px-2 py-1.5 text-sm"
                  placeholder="Название этапа"
                  value={stageName}
                  onChange={(e) => setStageName(e.target.value)}
                  onBlur={() => {
                    if (stageName.trim())
                      createStage.mutate({
                        name: stageName.trim(),
                        ownerId: boardUserId,
                      });
                    setNewStage(false);
                    setStageName("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")
                      (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") {
                      setStageName("");
                      setNewStage(false);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1 text-sm text-odoo-text-muted hover:text-odoo-text"
                  onClick={() => setNewStage(true)}
                >
                  <Plus className="h-4 w-4" /> Добавить этап
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </AppShell>
  );
}
