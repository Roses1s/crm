import { useState } from "react";

/**
 * Быстрое создание лида в колонке. В макете форма ничего не отправляет —
 * это только вёрстка полей и кнопок.
 */
export function QuickCreate({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");

  return (
    <form
      className="border-b border-odoo-border-light bg-odoo-surface px-2.5 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        onDone();
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
          className="rounded-[3px] bg-odoo-primary px-3 py-1 text-[12px] font-medium text-white hover:opacity-90 disabled:opacity-60"
          disabled={!name.trim() || !inn.trim()}
        >
          Добавить
        </button>
        <button
          type="button"
          className="px-1 py-1 text-[12px] text-odoo-text-muted hover:text-odoo-text"
          onClick={onDone}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}
