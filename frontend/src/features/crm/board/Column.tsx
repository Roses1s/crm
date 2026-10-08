import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreHorizontal } from "lucide-react";
import { useCallback, useState } from "react";

import { KANBAN_PAGE_SIZE, useDeleteStage, useUpdateStage } from "@/shared/api/hooks";
import { Modal } from "@/shared/ui/modal";
import type { Lead, Stage } from "@/shared/types";
import { LeadCard } from "./LeadCard";
import { stageDragId } from "./stage-order";
import { STAGE_COLORS, stageColor } from "./stage-colors";

/**
 * Колонка канбана: приёмник для перетаскивания карточек и меню управления
 * этапом (переименовать, цвет, удалить). Заголовок служит ручкой для
 * горизонтального перетаскивания этапа.
 */
export function Column({
  stage,
  leads,
  total = leads.length,
  hasNextPage = false,
  isFetchingNextPage = false,
  isLoading = false,
  isError = false,
  onLoadMore,
  onRetry,
  folded,
  onFold,
  allStages,
}: {
  stage: Stage;
  leads: Lead[];
  total?: number;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  onLoadMore?: () => void;
  onRetry?: () => void;
  folded: boolean;
  onFold: () => void;
  allStages: Stage[];
}) {
  const leadCount = Math.max(total, leads.length);
  const { setNodeRef: setDropNodeRef, isOver } = useDroppable({
    id: `stage-${stage.id}`,
  });
  const {
    attributes: stageDragAttributes,
    listeners: stageDragListeners,
    setNodeRef: setStageSortNodeRef,
    transform: stageTransform,
    transition: stageTransition,
    isDragging: isStageDragging,
  } = useSortable({ id: stageDragId(stage.id) });
  const setNodeRef = useCallback(
    (node: HTMLDivElement | HTMLButtonElement | null) => {
      setDropNodeRef(node);
      setStageSortNodeRef(node);
    },
    [setDropNodeRef, setStageSortNodeRef],
  );
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [menu, setMenu] = useState(false);
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
        ref={setNodeRef}
        onClick={onFold}
        {...stageDragAttributes}
        {...stageDragListeners}
        className="flex h-full w-10 shrink-0 cursor-grab flex-col items-center bg-odoo-board-canvas py-3 active:cursor-grabbing"
        style={{
          borderTop: `3px solid ${color}`,
          transform: CSS.Translate.toString(stageTransform),
          transition: stageTransition,
        }}
      >
        <span className="mt-8 origin-center rotate-180 text-[12px] font-semibold tracking-wide text-odoo-text [writing-mode:vertical-rl]">
          {stage.name} ({leadCount})
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
      data-testid={`kanban-column-${stage.id}`}
      style={{
        transform: CSS.Translate.toString(stageTransform),
        transition: stageTransition,
      }}
      className={`flex h-full w-[var(--odoo-kanban-group-width)] shrink-0 snap-center flex-col transition-colors duration-200 ${
        isOver ? "bg-odoo-drop" : "bg-odoo-board-canvas"
      } ${isStageDragging ? "opacity-40" : ""}`}
    >
      <div className="crm-kanban-stage-header shrink-0 bg-odoo-board-canvas px-[var(--odoo-kanban-group-padding-x)] py-2">
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
                {...stageDragAttributes}
                {...stageDragListeners}
                className="cursor-grab truncate text-[13px] font-semibold leading-[18px] text-odoo-text active:cursor-grabbing"
                onDoubleClick={() => setEditing(true)}
                title="Двойной клик — переименовать"
              >
                {stage.name}
              </button>
            )}
          </div>
          <div className="relative flex items-center gap-px">
            <button
              type="button"
              className="crm-kanban-stage-secondary-action crm-kanban-stage-fold-action inline-flex h-6 w-5 items-center justify-center rounded-sm text-[17px] leading-none text-odoo-text-muted hover:bg-odoo-surface-sunken hover:text-odoo-text"
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
                  className="crm-kanban-stage-secondary-action crm-kanban-stage-menu-action inline-flex h-6 w-6 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-surface-sunken hover:text-odoo-text"
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
                        setMoveTo(allStages.find((s) => s.id !== stage.id)?.id ?? null);
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
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="h-3 w-1/2 overflow-hidden bg-odoo-track">
            <div
              className="h-full min-w-1"
              style={{
                width: `${Math.min(100, Math.max(4, leadCount * 12))}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <span
            className="flex h-3 w-5 shrink-0 items-center justify-end text-right text-[13px] font-semibold leading-none text-odoo-text [font-variant-numeric:tabular-nums]"
            aria-label={`Лидов в этапе: ${leadCount}`}
          >
            {leadCount}
          </span>
        </div>
      </div>
      {confirmDelete && (
        <Modal
          label="Удаление этапа"
          onClose={() => setConfirmDelete(false)}
          panelClassName="w-full max-w-sm"
        >
          <div>
            <h3 className="text-[15px] font-semibold text-odoo-text">
              Удалить этап «{stage.name}»?
            </h3>
            {isLoading ? (
              <p className="mt-2 text-[13px] text-odoo-text-muted">
                Проверяем количество карточек…
              </p>
            ) : leadCount > 0 ? (
              <>
                <p className="mt-2 text-[13px] text-odoo-text-muted">
                  В этапе {leadCount} лид(ов). Выберите, куда их перенести — без этого удалить
                  нельзя.
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
                disabled={remove.isPending || isLoading || (leadCount > 0 && moveTo === null)}
                className="h-8 rounded-[4px] bg-odoo-danger px-3 text-sm font-medium text-white disabled:opacity-60"
                onClick={() => {
                  remove.mutate(
                    {
                      id: stage.id,
                      fallbackId: leadCount ? (moveTo ?? undefined) : undefined,
                    },
                    { onSuccess: () => setConfirmDelete(false) },
                  );
                }}
              >
                Удалить
              </button>
            </div>
          </div>
        </Modal>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain [scrollbar-gutter:stable]">
        <SortableContext
          items={leads.map((lead) => `lead-${lead.id}`)}
          strategy={verticalListSortingStrategy}
        >
          {leads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </SortableContext>
        {isLoading && leads.length === 0 && (
          <p className="px-3 py-4 text-center text-[12px] text-odoo-text-muted">Загрузка…</p>
        )}
        {isError && onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mx-2.5 mb-2 rounded-[3px] border border-odoo-danger/30 px-2 py-1.5 text-[12px] text-odoo-danger"
          >
            Не удалось загрузить лиды. Повторить
          </button>
        )}
        {hasNextPage && onLoadMore && (
          <button
            type="button"
            disabled={isFetchingNextPage}
            onClick={onLoadMore}
            className="mx-2.5 mb-2 rounded-[3px] border border-dashed border-odoo-border px-2 py-1.5 text-[13px] text-odoo-text-muted transition-colors hover:bg-odoo-surface-hover hover:text-odoo-text disabled:cursor-wait disabled:opacity-60"
          >
            {isFetchingNextPage
              ? "Загрузка…"
              : `Показать ещё ${Math.min(KANBAN_PAGE_SIZE, Math.max(leadCount - leads.length, 0))} из ${leadCount}`}
          </button>
        )}
      </div>
    </div>
  );
}
