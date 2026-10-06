import { LayoutGrid, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useUsers } from "@/shared/api/hooks";

/**
 * Подбор сотрудников по тому, что админ набрал в строке поиска.
 * Возвращает готовый выпадающий список — он показывается прямо под полем.
 * Используется на доске лидов («открыть доску») и в списке заявок
 * («показать заявки»), поэтому подпись действия задаётся снаружи.
 */
export function BoardSuggestions({
  query,
  excludeUserId,
  onPick,
  actionLabel = "открыть доску",
}: {
  query: string;
  /** Уже выбранный сотрудник — из подсказок его убираем. */
  excludeUserId: number | null;
  onPick: (userId: number) => void;
  /** Текст справа в строке подсказки, например «показать заявки». */
  actionLabel?: string;
}) {
  const { data: users = [] } = useUsers();
  // Закрытие «крестиком» не должно возвращаться, пока не изменится запрос.
  const [dismissed, setDismissed] = useState("");

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return users
      .filter((u) => u.is_active && u.id !== excludeUserId)
      .filter((u) => `${u.last_name} ${u.first_name} ${u.email}`.toLowerCase().includes(q))
      .slice(0, 5);
  }, [users, query, excludeUserId]);

  if (matches.length === 0 || dismissed === query.trim()) return null;

  return (
    <div className="absolute inset-x-0 top-full z-50 mt-1 overflow-hidden rounded-[3px] border border-odoo-border bg-odoo-surface shadow-lg">
      <div className="flex items-center justify-between border-b border-odoo-border-light px-3 py-1">
        <span className="text-[11px] uppercase tracking-wide text-odoo-text-muted">Сотрудники</span>
        <button
          type="button"
          aria-label="Скрыть подсказку"
          onClick={() => setDismissed(query.trim())}
          className="text-odoo-text-muted hover:text-odoo-text"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {matches.map((u) => (
        <button
          key={u.id}
          type="button"
          onClick={() => onPick(u.id)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-odoo-text hover:bg-odoo-bg"
        >
          <LayoutGrid className="h-3.5 w-3.5 shrink-0 text-odoo-text-muted" />
          <span className="min-w-0 flex-1 truncate">
            {`${u.last_name} ${u.first_name}`.trim() || u.email}
          </span>
          <span className="shrink-0 text-[11px] text-odoo-text-muted">{actionLabel}</span>
        </button>
      ))}
    </div>
  );
}
