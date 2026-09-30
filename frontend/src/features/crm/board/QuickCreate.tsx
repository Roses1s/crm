import { useState } from "react";

import { ApiError } from "@/shared/api/client";
import { useCreateLead } from "@/shared/api/hooks";

/**
 * Быстрое создание лида прямо в колонке: название + ИНН.
 * Контрольную сумму ИНН проверяет сервер — его сообщение и показываем.
 */
export function QuickCreate({
  stageId,
  onDone,
}: {
  stageId: number;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const create = useCreateLead();

  const error = create.error
    ? create.error instanceof ApiError && create.error.status === 422
      ? "Проверьте ИНН: нужно 10 или 12 цифр с верной контрольной суммой"
      : "Не удалось создать лид"
    : "";

  return (
    <form
      className="mx-2 mb-1 rounded-[2px] border border-odoo-border-light bg-odoo-board-card px-2.5 py-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim() || !inn.trim()) return;
        create.mutate(
          { name: name.trim(), inn: inn.trim(), stage_id: stageId },
          {
            onSuccess: () => {
              setName("");
              setInn("");
              onDone();
            },
          },
        );
      }}
    >
      <div className="border border-odoo-accent-line bg-odoo-surface shadow-xs focus-within:ring-1 focus-within:ring-odoo-accent-line">
        <input
          autoFocus
          className="block h-8 w-full border-b border-odoo-border-light px-2 text-[13px] outline-none placeholder:text-odoo-text-light"
          placeholder="Название"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="block h-8 w-full px-2 text-[13px] outline-none placeholder:text-odoo-text-light"
          placeholder="ИНН"
          inputMode="numeric"
          value={inn}
          onChange={(e) => setInn(e.target.value)}
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          className="rounded-[3px] bg-odoo-primary px-3 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          disabled={create.isPending || !name.trim() || !inn.trim()}
        >
          {create.isPending ? "Добавление…" : "Добавить"}
        </button>
        <button
          type="button"
          className="px-1 py-1 text-[12px] text-odoo-text-muted hover:text-odoo-text"
          onClick={onDone}
        >
          Отмена
        </button>
      </div>
      {error && <p className="mt-1.5 text-[11px] text-odoo-danger">{error}</p>}
    </form>
  );
}
