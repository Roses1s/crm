import { MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import type { Lead, Stage } from "@/shared/types";
import { LeadCard } from "./LeadCard";
import { QuickCreate } from "./QuickCreate";
import { STAGE_COLORS, stageColor } from "./stage-colors";

// Колонка рисует страницу карточек, остальное — по кнопке, как в канбане Odoo.
const CARDS_PER_COLUMN = 20;

/**
 * Колонка канбана. Зона перетаскивания и мутации этапа убраны:
 * меню этапа открывается, но пункты ничего не меняют.
 */
export function Column({
  stage,
  leads,
  folded,
  onFold,
}: {
  stage: Stage;
  leads: Lead[];
  folded: boolean;
  onFold: () => void;
}) {
  const [visible, setVisible] = useState(CARDS_PER_COLUMN);
  const shown = leads.slice(0, visible);
  const hidden = leads.length - shown.length;
  const [menu, setMenu] = useState(false);
  const [quick, setQuick] = useState(false);
  const color = stageColor(stage.color);

  if (folded) {
    return (
      <button
        type="button"
        onClick={onFold}
        className="flex h-full w-10 shrink-0 flex-col items-center border-r border-odoo-border-light bg-odoo-surface py-3"
        style={{ borderTop: `3px solid ${color}` }}
      >
        <span className="mt-8 origin-center rotate-180 text-[12px] font-semibold tracking-wide text-odoo-text [writing-mode:vertical-rl]">
          {stage.name} ({leads.length})
        </span>
      </button>
    );
  }

  return (
    <div className="flex h-full w-[min(100vw-1rem,325px)] shrink-0 snap-center flex-col border-r border-odoo-border-light bg-odoo-surface md:w-[325px]">
      <div className="shrink-0 bg-odoo-column-head px-2.5 pb-2 pt-2">
        <div className="flex items-start justify-between gap-1">
          <div className="min-w-0">
            <span className="truncate text-[15px] font-semibold leading-5 text-odoo-text">
              {stage.name}
              <span className="ml-1 font-normal text-odoo-text-muted">{leads.length}</span>
            </span>
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
                  onClick={() => setMenu(false)}
                >
                  Переименовать
                </button>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                  onClick={() => setMenu(false)}
                >
                  {stage.is_closed ? "Открывающий этап" : "Закрывающий этап"}
                </button>
                <div className="flex flex-wrap gap-1 px-3 py-1.5">
                  {Object.keys(STAGE_COLORS).map((c) => (
                    <button
                      key={c}
                      type="button"
                      className="h-4 w-4 rounded-full border border-white shadow-sm"
                      style={{ background: STAGE_COLORS[c] }}
                      onClick={() => setMenu(false)}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm text-odoo-danger hover:bg-odoo-bg"
                  onClick={() => setMenu(false)}
                >
                  Удалить
                </button>
              </div>
            )}
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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain bg-odoo-surface [scrollbar-gutter:stable]">
        {shown.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
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
          <QuickCreate onDone={() => setQuick(false)} />
        ) : (
          <button
            type="button"
            className="flex w-full items-center gap-1 px-2.5 py-2 text-left text-[13px] text-odoo-text-muted hover:bg-odoo-surface-hover hover:text-odoo-text"
            onClick={() => setQuick(true)}
          >
            <Plus className="h-3.5 w-3.5" /> Добавить
          </button>
        )}
      </div>
    </div>
  );
}
