import { useState } from "react";

import { useLossReasons } from "@/shared/api/hooks";

/**
 * Отметить лид проигранным — причина обязательна.
 *
 * Раньше это было простое «Архивировать» с системным confirm. Теперь нужно
 * явно выбрать причину — без неё в чаттере не появится история, из-за которой
 * потом непонятно, почему клиент ушёл.
 */
export function LoseLeadDialog({
  leadName,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  leadName: string;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (reasonId: number) => void;
}) {
  const { data: reasons = [], isLoading } = useLossReasons();
  const [chosen, setChosen] = useState<number | null>(null);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-odoo-overlay/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-odoo-surface p-4 shadow-lg">
        <h3 className="text-[15px] font-semibold text-odoo-text">Отметить проигрышем?</h3>
        <p className="mt-1 text-[13px] text-odoo-text-muted">
          Карточка «{leadName}» уйдёт с доски. Она останется в базе — любой сотрудник сможет
          посмотреть причину и забрать её себе.
        </p>

        <div className="mt-3">
          <p className="mb-1.5 text-[13px] font-medium text-odoo-text">Причина</p>
          {isLoading ? (
            <p className="text-[13px] text-odoo-text-light">Загрузка…</p>
          ) : reasons.length === 0 ? (
            <p className="text-[13px] text-odoo-text-light">
              Причины не настроены — обратитесь к администратору.
            </p>
          ) : (
            <div className="flex flex-col gap-1">
              {reasons.map((r) => (
                <label
                  key={r.id}
                  className="flex cursor-pointer items-center gap-2 rounded-[4px] px-2 py-1.5 text-[13px] text-odoo-text hover:bg-odoo-bg"
                >
                  <input
                    type="radio"
                    name="loss-reason"
                    checked={chosen === r.id}
                    onChange={() => setChosen(r.id)}
                    className="h-3.5 w-3.5 accent-[rgb(var(--odoo-primary))]"
                  />
                  {r.name}
                </label>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-3 text-[13px] text-odoo-danger">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={pending || chosen === null}
            onClick={() => chosen !== null && onConfirm(chosen)}
            className="h-8 rounded-[4px] bg-odoo-danger px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Отмечаем…" : "Отметить проигрышем"}
          </button>
        </div>
      </div>
    </div>
  );
}
