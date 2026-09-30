import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";

import { useDeleteStage, useUpdateStage } from "@/shared/api/hooks";
import type { Lead, Stage } from "@/shared/types";
import { LeadCard } from "./LeadCard";
import { QuickCreate } from "./QuickCreate";
import { STAGE_COLORS, stageColor } from "./stage-colors";

// Колонка рисует страницу карточек, остальное — по кнопке, как в канбане Odoo.
const CARDS_PER_COLUMN = 20;

/**
 * Колонка канбана: приёмник для перетаскивания карточек и меню управления
 * этапом (переименовать, закрывающий, цвет, удалить).
 */
export function Column({
  stage,
  leads,
  folded,
  onFold,
  allStages,
}: {
  stage: Stage;
  leads: Lead[];
  folded: boolean;
  onFold: () => void;
  allStages: Stage[];
}) {
  const [visible, setVisible] = useState(CARDS_PER_COLUMN);
  const shown = leads.slice(0, visible);
  const hidden = leads.length - shown.length;
  const { setNodeRef, isOver } = useDroppable({ id: `stage-${stage.id}` });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  // Диалог удаления: у непустого этапа спрашиваем, куда переложить карточки.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveTo, setMoveTo] = useState<number | null>(null);
  const color = stageColor(stage.color);

  const patch = useUpdateStage();
  const remove = useDeleteStage();

  if (folded) {
    return (
      <button
        type="button"
        onClick={onFold}
        className="flex h-full w-10 shrink-0 flex-col items-center bg-odoo-board-canvas py-3"
        style={{ borderTop: `3px solid ${color}` }}
      >
        <span className="mt-8 origin-center rotate-180 text-[12px] font-semibold tracking-wide text-odoo-text [writing-mode:vertical-rl]">
          {stage.name} ({leads.length})
        </span>
      </button>
    );
  }

  return (
    // Зона приёма — вся колонка целиком, вместе с шапкой: раньше ref стоял
    // только на списке карточек, и бросок в заголовок или в пустоту под ним
    // проходил мимо — карточка возвращалась на место.
    <div
      ref={setNodeRef}
      className={`flex h-full w-[var(--odoo-kanban-group-width)] shrink-0 snap-center flex-col transition-colors duration-200 ${
        isOver ? "bg-odoo-drop" : "bg-odoo-board-canvas"
      }`}
    >
      <div className="shrink-0 bg-odoo-board-canvas px-3 pb-2 pt-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            {editing ? (
              <input
                autoFocus
                className="w-full rounded-[3px] border border-odoo-primary px-1 text-[13px] font-semibold leading-[18px]"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => {
                  setEditing(false);
                  if (name.trim() && name !== stage.name) {
                    patch.mutate({ id: stage.id, name: name.trim() });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <button
                type="button"
                className="truncate text-[13px] font-semibold leading-[18px] text-odoo-text"
                onDoubleClick={() => setEditing(true)}
                title="Двойной клик — переименовать"
              >
                {stage.name}
                <span className="ml-1 font-normal text-odoo-text-muted">
                  {leads.length}
                </span>
              </button>
            )}
          </div>
          <div className="relative flex items-center gap-px">
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-surface-sunken hover:text-odoo-text"
              onClick={() => setQuick(true)}
              title="Добавить лид"
              aria-label="Добавить лид"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className="inline-flex h-6 w-5 items-center justify-center rounded-sm text-[17px] leading-none text-odoo-text-muted hover:bg-odoo-surface-sunken hover:text-odoo-text"
              onClick={onFold}
              title="Свернуть"
              aria-label="Свернуть этап"
            >
              ‹
            </button>
            {
              <>
                <button
                  type="button"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-surface-sunken hover:text-odoo-text"
                  onClick={() => setMenu((v) => !v)}
                  title="Меню этапа"
                  aria-label="Меню этапа"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {menu && (
                  <div className="absolute right-0 top-6 z-20 min-w-[200px] rounded-[4px] border border-odoo-border bg-odoo-surface py-1 shadow-lg">
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                      onClick={() => {
                        setMenu(false);
                        setEditing(true);
                      }}
                    >
                      Переименовать
                    </button>
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                      onClick={() => {
                        setMenu(false);
                        patch.mutate({
                          id: stage.id,
                          is_closed: !stage.is_closed,
                        });
                      }}
                    >
                      {stage.is_closed
                        ? "Открывающий этап"
                        : "Закрывающий этап"}
                    </button>
                    <div className="flex flex-wrap gap-1 px-3 py-1.5">
                      {Object.keys(STAGE_COLORS).map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={`Цвет ${c}`}
                          className="h-4 w-4 rounded-full border border-odoo-surface shadow-sm"
                          style={{ background: STAGE_COLORS[c] }}
                          onClick={() => {
                            setMenu(false);
                            patch.mutate({ id: stage.id, color: c });
                          }}
                        />
                      ))}
                    </div>
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-sm text-odoo-danger hover:bg-odoo-bg"
                      onClick={() => {
                        setMenu(false);
                        setMoveTo(
                          allStages.find((s) => s.id !== stage.id)?.id ?? null,
                        );
                        setConfirmDelete(true);
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                )}
              </>
            }
          </div>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <div className="h-2.5 w-[150px] overflow-hidden bg-odoo-track">
            <div
              className="h-full min-w-1"
              style={{
                width: `${Math.min(100, Math.max(4, leads.length * 12))}%`,
                backgroundColor: color,
              }}
            />
          </div>
        </div>
      </div>
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-odoo-overlay/30 p-4">
          <div className="w-full max-w-sm rounded-lg bg-odoo-surface p-4 shadow-lg">
            <h3 className="text-[15px] font-semibold text-odoo-text">
              Удалить этап «{stage.name}»?
            </h3>
            {leads.length > 0 ? (
              <>
                <p className="mt-2 text-[13px] text-odoo-text-muted">
                  В этапе {leads.length} лид(ов). Выберите, куда их перенести —
                  без этого удалить нельзя.
                </p>
                <select
                  className="mt-3 w-full rounded-[4px] border border-odoo-border px-2.5 py-1.5 text-sm"
                  value={moveTo ?? ""}
                  onChange={(e) => setMoveTo(Number(e.target.value))}
                >
                  {allStages
                    .filter((s) => s.id !== stage.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </>
            ) : (
              <p className="mt-2 text-[13px] text-odoo-text-muted">
                Этап пустой, лиды не пострадают.
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg"
                onClick={() => setConfirmDelete(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={
                  remove.isPending || (leads.length > 0 && moveTo === null)
                }
                className="h-8 rounded-[4px] bg-odoo-danger px-3 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => {
                  remove.mutate(
                    {
                      id: stage.id,
                      fallbackId: leads.length
                        ? (moveTo ?? undefined)
                        : undefined,
                    },
                    { onSuccess: () => setConfirmDelete(false) },
                  );
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
        <SortableContext
          items={shown.map((l) => `lead-${l.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {shown.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setVisible((n) => n + CARDS_PER_COLUMN)}
            className="mx-2.5 mb-2 rounded-[3px] border border-dashed border-odoo-border px-2 py-1.5 text-[13px] text-odoo-text-muted transition-colors hover:bg-odoo-surface-hover hover:text-odoo-text"
          >
            Показать ещё {Math.min(CARDS_PER_COLUMN, hidden)} из {leads.length}
          </button>
        )}
        {quick ? (
          <QuickCreate stageId={stage.id} onDone={() => setQuick(false)} />
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-1 px-3 py-1.5 text-left text-[12px] text-odoo-text-muted hover:bg-odoo-surface-hover hover:text-odoo-text"
            onClick={() => setQuick(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Добавить
          </button>
        )}
      </div>
    </div>
  );
}
