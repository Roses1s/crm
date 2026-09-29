import { Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { useUsers } from "@/shared/api/hooks";

/**
 * Переключатель досок для администратора: набрал фамилию — открылась воронка
 * сотрудника. Менеджеры этот блок не видят, у них доска всегда своя.
 */
export function BoardSwitcher({
  boardUserId,
  onChange,
}: {
  boardUserId: number | null;
  onChange: (userId: number | null) => void;
}) {
  const { data: users = [] } = useUsers();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const current = users.find((u) => u.id === boardUserId);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = users.filter((u) => u.is_active);
    if (!q) return rows.slice(0, 8);
    return rows
      .filter((u) =>
        `${u.last_name} ${u.first_name} ${u.email}`.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [users, query]);

  function pick(userId: number | null) {
    onChange(userId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative flex items-center gap-2 border-b border-odoo-border-light bg-odoo-surface px-3 py-1.5">
      {current ? (
        <>
          <span className="rounded-[3px] bg-odoo-accent-soft px-2 py-0.5 text-[12px] font-medium text-odoo-action">
            Доска сотрудника:{" "}
            {`${current.last_name} ${current.first_name}`.trim() ||
              current.email}
          </span>
          <button
            type="button"
            onClick={() => pick(null)}
            className="inline-flex items-center gap-1 text-[12px] text-odoo-text-muted hover:text-odoo-text"
          >
            <X className="h-3.5 w-3.5" /> вернуться к своей
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-[12px] text-odoo-text-muted hover:text-odoo-text"
        >
          <Search className="h-3.5 w-3.5" /> Открыть доску сотрудника
        </button>
      )}

      {open && !current && (
        <div className="absolute left-3 top-full z-40 w-72 rounded-b-[3px] border border-t-0 border-odoo-border bg-odoo-surface p-1 shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Фамилия или email"
            className="mb-1 w-full rounded-[4px] border border-odoo-border px-2 py-1 text-sm"
          />
          {found.length === 0 ? (
            <p className="px-2 py-1 text-[12px] text-odoo-text-light">
              Никого не нашли
            </p>
          ) : (
            found.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => pick(u.id)}
                className="block w-full truncate px-2 py-1 text-left text-sm hover:bg-odoo-bg"
              >
                {`${u.last_name} ${u.first_name}`.trim() || u.email}
                <span className="ml-1 text-[11px] text-odoo-text-muted">
                  {u.role === "admin" ? "администратор" : "менеджер"}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
