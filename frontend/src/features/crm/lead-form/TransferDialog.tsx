import { Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useColleagues, type Colleague } from "@/shared/api/hooks";
import { Modal } from "@/shared/ui/modal";

/**
 * Передача лида другому продавцу.
 *
 * Два шага намеренно: сначала выбор сотрудника, потом подтверждение. Действие
 * необратимое для менеджера — карточка уходит с его доски и обратно он её уже
 * не заберёт, поэтому случайный щелчок не должен ничего решать.
 */
export function TransferDialog({
  leadName,
  leadIsLost = false,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  leadName: string;
  /** Лид сейчас в проигрыше — передача заодно вернёт его на доску получателя. */
  leadIsLost?: boolean;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (userId: number) => void;
}) {
  const { data: colleagues = [], isLoading } = useColleagues();
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Colleague | null>(null);

  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return colleagues.slice(0, 8);
    return colleagues.filter((c) => c.full_name.toLowerCase().includes(q)).slice(0, 8);
  }, [colleagues, query]);

  return (
    <Modal label="Передача лида" onClose={onCancel}>
      <div>
        {chosen ? (
          <>
            <h3 className="text-[15px] font-semibold text-odoo-text">Передать лид?</h3>
            <p className="mt-2 text-[13px] leading-relaxed text-odoo-text-muted">
              Карточка «{leadName}» перейдёт к сотруднику{" "}
              <span className="font-medium text-odoo-text">{chosen.full_name}</span> вместе с
              заявками, документами и перепиской. С вашей доски она исчезнет.
              {leadIsLost && " Лид также выйдет из проигрыша и вернётся на доску."}
            </p>
            {error && <p className="mt-3 text-[13px] text-odoo-danger">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setChosen(null)}
                className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg"
              >
                Назад
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => onConfirm(chosen.id)}
                className="h-8 rounded-[4px] bg-odoo-primary px-3 text-sm font-medium text-white transition-colors hover:bg-odoo-primary-hover disabled:opacity-60"
              >
                {pending ? "Передаём…" : "Передать"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h3 className="text-[15px] font-semibold text-odoo-text">Кому передать лид</h3>
            <p className="mt-1 text-[13px] text-odoo-text-muted">
              Начните вводить фамилию коллеги.
            </p>
            <div className="mt-3 flex h-9 items-center rounded-[4px] border border-odoo-border px-2">
              <Search className="h-4 w-4 shrink-0 text-odoo-text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Фамилия или имя"
                className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none"
              />
            </div>

            <div className="mt-2 max-h-64 overflow-y-auto">
              {isLoading ? (
                <p className="px-1 py-2 text-[13px] text-odoo-text-light">Загрузка…</p>
              ) : found.length === 0 ? (
                <p className="px-1 py-2 text-[13px] text-odoo-text-light">
                  Никого не нашли. Сотрудников заводит администратор.
                </p>
              ) : (
                found.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setChosen(c)}
                    className="block w-full truncate rounded-[4px] px-2 py-1.5 text-left text-sm text-odoo-text hover:bg-odoo-bg"
                  >
                    {c.full_name}
                  </button>
                ))
              )}
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onCancel}
                className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg"
              >
                Отмена
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
