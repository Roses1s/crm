import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { MoreVertical } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import type { Lead } from "@/shared/types";
import { StarRating } from "./StarRating";

export function LeadCardBody({
  lead,
  menuSpace = false,
}: {
  lead: Lead;
  menuSpace?: boolean;
}) {
  const title = `${lead.name} — ${lead.inn}`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className={menuSpace ? "pr-7" : ""}>
        <h3
          className="line-clamp-2 text-[13px] font-medium leading-[17px] text-odoo-text"
          title={title}
        >
          {title}
        </h3>
        <p
          className="mt-px truncate text-[12px] leading-4 text-odoo-text-muted"
          title={lead.logist_contact || lead.name}
        >
          {lead.logist_contact || lead.name}
        </p>
      </div>

      {lead.tags?.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1 overflow-hidden">
          {lead.tags.map((tag) => (
            <span
              key={tag.id}
              title={tag.name}
              className="inline-flex max-w-full items-center rounded-full bg-odoo-chip px-1.5 py-px text-[10px] font-normal leading-[13px] text-odoo-chip-text"
            >
              <span className="max-w-[150px] truncate">{tag.name}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-0.5 flex shrink-0 items-end justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <StarRating value={lead.priority} />
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
      className={`overflow-hidden rounded-[2px] border border-odoo-border-light bg-odoo-board-card px-2.5 py-1.5 ${
        isOverlay
          ? "w-[340px] rotate-2 scale-[1.02] cursor-grabbing border-odoo-primary shadow-2xl transition-transform"
          : isDragging
            ? "cursor-grabbing opacity-40 transition-opacity duration-150"
            : "cursor-grab transition-colors duration-150 hover:bg-odoo-board-card-hover"
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
      className="group relative mx-2 mb-1 touch-none"
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
