import {
  DndContext,
  pointerWithin,
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
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import {
  BoardBanner,
  BoardSuggestions,
} from "@/features/crm/board/BoardSwitcher";
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
} from "@/shared/api/hooks";
import type { Lead } from "@/shared/types";

// Приземление карточки: чуть дольше и с «доводкой» в конце — так глаз успевает
// проследить путь от курсора до места в колонке.
const dropAnimation: DropAnimation = {
  duration: 260,
  easing: "cubic-bezier(0.2, 0, 0, 1)",
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: "0.4" } },
  }),
};

/**
 * Канбан лидов.
 *
 * Фильтры и режим просмотра живут в адресной строке — ссылку на отфильтрованную
 * доску можно переслать коллеге. Перетаскивание карточки меняет этап на сервере
 * (оптимистично: карточка переезжает сразу, при ошибке возвращается назад).
 */
export function KanbanPage() {
  const [params, setParams] = useSearchParams();
  const canManage = useCanManage();

  const search = params.get("search") ?? "";
  // Админ может открыть доску сотрудника: номер лежит в адресе (?board=N).
  const boardParam = params.get("board");
  const view = params.get("view") === "list" ? "list" : "kanban";

  const [searchInput, setSearchInput] = useState(search);
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
  // Фильтров в интерфейсе больше нет: доска у каждого своя, а нужную карточку
  // ищут поиском. Из параметров остаётся чужая доска для администратора.
  const { data: leads = [] } = useLeads({ search, assigned: boardUserId });
  const { data: stages = [] } = useStages(boardUserId);
  const moveLead = useMoveLead();
  const createStage = useCreateStage();

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  }

  /**
   * Сначала смотрим, под каким элементом курсор, и только если он не попал
   * никуда — ищем ближайший. Один closestCorners промахивался: у соседней
   * колонки угол мог оказаться ближе, чем у той, куда целится пользователь.
   */
  function collisionDetection(args: Parameters<typeof closestCorners>[0]) {
    const pointer = pointerWithin(args);
    return pointer.length > 0 ? pointer : closestCorners(args);
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

  return (
    <AppShell>
      <ControlPanel
        title="Лиды"
        search={searchInput}
        onSearch={setSearchInput}
        createTo="/crm/leads/new"
        view={view}
        onView={(v) => setFilter("view", v === "list" ? "list" : "")}
        count={view === "list" ? leads.length : undefined}
        searchSuggestions={
          isAdmin ? (
            <BoardSuggestions
              query={searchInput}
              boardUserId={boardUserId}
              onPick={(userId) => {
                // Строку поиска очищаем: на чужой доске отбор по фамилии
                // сотрудника не нужен.
                setSearchInput("");
                setFilter("board", String(userId));
              }}
            />
          ) : undefined
        }
      ></ControlPanel>

      {boardUserId !== null && (
        <BoardBanner
          boardUserId={boardUserId}
          onLeave={() => setFilter("board", "")}
        />
      )}

      {moveLead.isError && (
        <div
          role="alert"
          className="mx-4 mt-3 rounded-[4px] border border-odoo-danger/30 bg-odoo-danger/10 px-3 py-2 text-sm text-odoo-danger"
        >
          Не удалось переместить лид. Изменение отменено.
        </div>
      )}

      {view === "list" && <LeadListView leads={leads} groupBy="stage" />}

      {view !== "list" && (
        <div className="flex h-[calc(100dvh-90px)] min-h-0 snap-x snap-mandatory gap-0 overflow-x-auto overflow-y-hidden overscroll-x-contain border-t border-odoo-border-light bg-odoo-surface md:snap-none">
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={onDragStart}
            onDragCancel={() => setActiveLead(null)}
            onDragEnd={onDragEnd}
          >
            {stages.map((stage) => (
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
            ))}
            <DragOverlay dropAnimation={dropAnimation} zIndex={50}>
              {activeLead ? <LeadCard lead={activeLead} isOverlay /> : null}
            </DragOverlay>
          </DndContext>

          {canManage && (
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
