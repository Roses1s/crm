import { LayoutGrid, X } from "lucide-react";
import { useMemo } from "react";

import { useUsers } from "@/shared/api/hooks";

/**
 * Доски сотрудников глазами администратора.
 *
 * Отдельного поля нет: админ набирает фамилию в обычной строке поиска, а тут
 * появляется подсказка «Открыть доску». Когда доска выбрана, на её месте
 * висит плашка с именем владельца — иначе легко забыть, что смотришь чужое.
 */
export function BoardSwitcher({
  boardUserId,
  query,
  onChange,
}: {
  boardUserId: number | null;
  query: string;
  onChange: (userId: number | null) => void;
}) {
  const { data: users = [] } = useUsers();
  const current = users.find((u) => u.id === boardUserId);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return users
      .filter((u) => u.is_active && u.id !== boardUserId)
      .filter((u) =>
        `${u.last_name} ${u.first_name} ${u.email}`.toLowerCase().includes(q),
      )
      .slice(0, 4);
  }, [users, query, boardUserId]);

  if (current) {
    return (
      <div className="flex items-center gap-2 border-b border-odoo-border-light bg-odoo-surface px-3 py-1.5">
        <span className="rounded-[3px] bg-odoo-accent-soft px-2 py-0.5 text-[12px] font-medium text-odoo-action">
          Доска сотрудника:{" "}
          {`${current.last_name} ${current.first_name}`.trim() || current.email}
        </span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex items-center gap-1 text-[12px] text-odoo-text-muted hover:text-odoo-text"
        >
          <X className="h-3.5 w-3.5" /> вернуться к своей
        </button>
      </div>
    );
  }

  if (matches.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-odoo-border-light bg-odoo-surface px-3 py-1.5">
      <span className="text-[12px] text-odoo-text-muted">Открыть доску:</span>
      {matches.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onChange(u.id)}
          className="inline-flex items-center gap-1 rounded-[3px] border border-odoo-border px-2 py-0.5 text-[12px] text-odoo-action transition-colors hover:bg-odoo-bg"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          {`${u.last_name} ${u.first_name}`.trim() || u.email}
        </button>
      ))}
    </div>
  );
}
