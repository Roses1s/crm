import { X } from "lucide-react";

import { useUsers } from "@/shared/api/hooks";

/** Плашка «вы на чужой доске» — иначе легко забыть, чьи карточки смотришь. */
export function BoardBanner({
  boardUserId,
  onLeave,
}: {
  boardUserId: number;
  onLeave: () => void;
}) {
  const { data: users = [] } = useUsers();
  const current = users.find((u) => u.id === boardUserId);
  if (!current) return null;

  return (
    <div className="flex items-center gap-2 border-b border-odoo-border-light bg-odoo-surface px-3 py-1.5">
      <span className="rounded-[3px] bg-odoo-accent-soft px-2 py-0.5 text-[12px] font-medium text-odoo-action">
        Доска сотрудника: {`${current.last_name} ${current.first_name}`.trim() || current.email}
      </span>
      <button
        type="button"
        onClick={onLeave}
        className="inline-flex items-center gap-1 text-[12px] text-odoo-text-muted hover:text-odoo-text"
      >
        <X className="h-3.5 w-3.5" /> вернуться к своей
      </button>
    </div>
  );
}
