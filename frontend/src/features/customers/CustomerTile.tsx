import { Lock } from "lucide-react";
import { Link } from "react-router-dom";

import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import type { Customer } from "@/shared/types";
import { StarRating } from "@/features/crm/board/StarRating";
import { TagChip } from "@/shared/ui/tag-chip";

/** Две буквы названия компании — для цветного квадрата вместо логотипа. */
function companyInitials(name: string): string {
  const cleaned = name.replace(/[«»"']/g, "").trim();
  return cleaned.slice(0, 2).toUpperCase() || "—";
}

/**
 * Плитка клиента — аналог карточки контакта в Odoo Contacts.
 *
 * Открыт (`can_open`) — свой лид или проигранный (чужой проигранный лид
 * может забрать себе любой сотрудник). Иначе плитка показывает только
 * название, ИНН и продавца, кликнуть на неё нельзя — курсор и цвет это
 * подсказывают.
 */
export function CustomerTile({ customer }: { customer: Customer }) {
  const body = (
    <div
      className={`flex h-full flex-col gap-2 rounded-[6px] border border-odoo-border-light bg-odoo-surface p-3 transition-colors ${
        customer.can_open ? "hover:border-odoo-border hover:bg-odoo-surface-hover" : "opacity-80"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] text-[13px] font-semibold text-white ${
            customer.is_archived ? "bg-odoo-text-light" : "bg-odoo-secondary"
          }`}
          aria-hidden="true"
        >
          {companyInitials(customer.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className="truncate text-[13px] font-semibold leading-[17px] text-odoo-text"
            title={customer.name}
          >
            {customer.name}
          </h3>
          <p className="truncate text-[12px] leading-4 text-odoo-text-muted">ИНН {customer.inn}</p>
        </div>
        {!customer.can_open && (
          <Lock
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-odoo-text-light"
            aria-label="Доступна только базовая информация"
          />
        )}
      </div>

      {customer.is_archived && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="inline-block rounded-sm bg-odoo-danger/10 px-1.5 py-0.5 text-[10px] font-medium text-odoo-danger">
            Проигрыш
          </span>
          {customer.loss_reason_name && (
            <span
              className="truncate text-[11px] text-odoo-text-muted"
              title={customer.loss_reason_name}
            >
              {customer.loss_reason_name}
            </span>
          )}
        </div>
      )}

      {customer.can_open && (customer.tags?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1 overflow-hidden">
          {customer.tags!.map((tag) => (
            <TagChip
              key={tag.id}
              name={tag.name}
              color={tag.color}
              maxWidthClassName="max-w-[120px]"
            />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 pt-1">
        <span
          className="flex min-w-0 items-center gap-1.5"
          title={ownerLabel(customer) || "Не назначен"}
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-odoo-primary text-[9px] font-semibold text-white">
            {ownerInitials(customer)}
          </span>
          <span className="truncate text-[12px] text-odoo-text-muted">
            {ownerLabel(customer) || "Не назначен"}
          </span>
        </span>
        {customer.can_open && typeof customer.priority === "number" && (
          <StarRating value={customer.priority} />
        )}
      </div>
    </div>
  );

  if (!customer.can_open) {
    return (
      <div
        className="block h-full cursor-default"
        title="Активный лид коллеги — доступны только название, ИНН и продавец"
      >
        {body}
      </div>
    );
  }

  return (
    <Link to={`/crm/leads/${customer.id}`} className="block h-full">
      {body}
    </Link>
  );
}
