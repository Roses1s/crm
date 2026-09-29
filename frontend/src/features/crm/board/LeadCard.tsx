import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Clock3, MoreVertical } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import type { ActivityState, Lead } from "@/shared/types";
import { StarRating } from "./StarRating";

/** Цвет часиков: как в Odoo — красный просрочен, оранжевый сегодня, зелёный впереди. */
const ACTIVITY_COLOR: Record<ActivityState, string> = {
  overdue: "text-odoo-danger",
  today: "text-odoo-warning",
  planned: "text-odoo-success",
  done: "text-odoo-text-muted",
};

export function LeadCardBody({
  lead,
  menuSpace = false,
}: {
  lead: Lead;
  menuSpace?: boolean;
}) {
  const title = `${lead.name} — ${lead.inn}`;
  const activityState = lead.activity_state ?? null;
  const activityHint = activityState
    ? `${lead.next_activity_summary ?? "Действие"} — ${lead.next_activity_date ?? ""}`
    : "Действий не запланировано";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={menuSpace ? "pr-7" : ""}>
        <h3
          className="line-clamp-3 text-[15px] font-medium leading-5 text-odoo-text"
          title={title}
        >
          {title}
        </h3>
        <p
          className="mt-0.5 truncate text-[13px] leading-[18px] text-odoo-text-muted"
          title={lead.logist_contact || lead.name}
        >
          {lead.logist_contact || lead.name}
        </p>
      </div>

      {lead.tags?.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1 overflow-hidden">
          {lead.tags.map((tag) => (
            <span
              key={tag.id}
              title={tag.name}
              className="inline-flex max-w-full items-center rounded-full bg-odoo-chip px-2 py-0.5 text-[11px] font-normal leading-[14px] text-odoo-chip-text"
            >
              <span className="max-w-[150px] truncate">{tag.name}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-1 flex shrink-0 items-end justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <StarRating value={lead.priority} />
          <span
            title={activityHint}
            className={
              activityState
                ? ACTIVITY_COLOR[activityState]
                : "text-odoo-text-light"
            }
          >
            <Clock3 className="h-4 w-4" />
          </span>
        </div>
        <span
          title={
            [ownerLabel(lead), lead.assigned_to_email]
              .filter(Boolean)
              .join(" · ") || "Не назначен"
          }
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-odoo-primary text-[9px] font-semibold text-white"
        >
          {ownerInitials(lead)}
        </span>
      </div>
    </div>
  );
}

/**
 * Карточка на доске. Перетаскивание включено через dnd-kit: карточку можно
 * тянуть в другую колонку, этап сохраняется на сервере (см. KanbanPage).
 */
export function LeadCard({
  lead,
  isOverlay,
}: {
  lead: Lead;
  isOverlay?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `lead-${lead.id}`,
    disabled: isOverlay,
    // Плавное расступание соседей: без своей длительности dnd-kit иногда
    // отдаёт нулевой transition, и карточки переставляются рывком.
    transition: { duration: 220, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });
  const style = isOverlay
    ? undefined
    : {
        transform: CSS.Translate.toString(transform),
        transition,
        // Подсказка браузеру: слой готовится заранее, движение не дёргается.
        willChange: transform ? "transform" : undefined,
      };

  const inner = (
    <div
      className={`overflow-hidden border-b border-odoo-border-light bg-odoo-surface px-2.5 py-2 ${
        isOverlay
          ? "w-[325px] rotate-2 scale-[1.02] cursor-grabbing rounded-[4px] border border-odoo-primary shadow-2xl transition-transform"
          : isDragging
            ? "cursor-grabbing opacity-40 transition-opacity duration-150"
            : "cursor-grab transition-colors duration-150 hover:bg-odoo-surface-hover"
      }`}
    >
      <LeadCardBody lead={lead} menuSpace={!isOverlay} />
    </div>
  );

  if (isOverlay) return inner;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="group relative touch-none"
      aria-label={`Переместить ${lead.name}`}
    >
      {!isDragging && (
        <div className="absolute right-1 top-1 z-20">
          <button
            type="button"
            aria-label="Меню карточки"
            title="Меню"
            className="rounded-[4px] p-1 text-odoo-text-light opacity-0 hover:bg-odoo-bg hover:text-odoo-text focus:opacity-100 group-hover:opacity-100"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div
              className="absolute right-0 top-7 min-w-[110px] rounded-[4px] border border-odoo-border bg-odoo-surface py-1 shadow-lg"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <Link
                to={`/crm/leads/${lead.id}`}
                className="block px-3 py-1.5 text-left text-xs text-odoo-text hover:bg-odoo-bg"
              >
                Открыть
              </Link>
            </div>
          )}
        </div>
      )}
      {isDragging ? (
        inner
      ) : (
        <Link to={`/crm/leads/${lead.id}`} className="block">
          {inner}
        </Link>
      )}
    </div>
  );
}
