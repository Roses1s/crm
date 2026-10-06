import { X } from "lucide-react";

import { useUsers } from "@/shared/api/hooks";

/**
 * Плашка «заявки сотрудника» — как плашка чужой доски у лидов. Без неё легко
 * забыть, что в списке отфильтрованы заявки одного человека, а не все.
 */
export function EmployeeBanner({ userId, onLeave }: { userId: number; onLeave: () => void }) {
  const { data: users = [] } = useUsers();
  const current = users.find((u) => u.id === userId);
  if (!current) return null;

  return (
    <div className="flex items-center gap-2 border-b border-odoo-border-light bg-odoo-surface px-3 py-1.5">
      <span className="rounded-[3px] bg-odoo-accent-soft px-2 py-0.5 text-[12px] font-medium text-odoo-action">
        Заявки сотрудника: {`${current.last_name} ${current.first_name}`.trim() || current.email}
      </span>
      <button
        type="button"
        onClick={onLeave}
        className="inline-flex items-center gap-1 text-[12px] text-odoo-text-muted hover:text-odoo-text"
      >
        <X className="h-3.5 w-3.5" /> показать все
      </button>
    </div>
  );
}
