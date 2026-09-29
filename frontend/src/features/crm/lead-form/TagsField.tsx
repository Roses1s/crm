// Виджет many2many_tags: выбранные теги — пилюли с крестиком, плюс меню добавления.
import { Plus, X } from "lucide-react";
import { useState } from "react";
import type { Tag } from "@/shared/types";

const TAG_STYLES: Record<string, string> = {
  blue: "bg-odoo-tag-blue-bg text-odoo-tag-blue-text",
  green: "bg-odoo-tag-green-bg text-odoo-tag-green-text",
  red: "bg-odoo-tag-red-bg text-odoo-tag-red-text",
  yellow: "bg-odoo-tag-yellow-bg text-odoo-tag-yellow-text",
  purple: "bg-odoo-tag-purple-bg text-odoo-tag-purple-text",
  orange: "bg-odoo-tag-orange-bg text-odoo-tag-orange-text",
};

export function TagsField({
  all,
  value,
  onChange,
}: {
  all: Tag[];
  value: number[];
  onChange: (ids: number[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = all.filter((t) => value.includes(t.id));
  const rest = all.filter((t) => !value.includes(t.id));

  if (all.length === 0) return <span className="text-odoo-text-light">Теги не настроены</span>;

  return (
    <div className="relative flex flex-wrap items-center gap-1">
      {selected.map((tag) => (
        <span
          key={tag.id}
          className={`inline-flex max-w-[220px] items-center gap-1 rounded-full px-2 py-0.5 text-[11px] leading-[16px] ${
            TAG_STYLES[tag.color] ?? "bg-odoo-chip text-odoo-chip-text"
          }`}
        >
          <span className="truncate" title={tag.name}>
            {tag.name}
          </span>
          <button
            type="button"
            aria-label={`Убрать тег ${tag.name}`}
            className="opacity-60 transition-opacity hover:opacity-100"
            onClick={() => onChange(value.filter((x) => x !== tag.id))}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {rest.length > 0 && (
        <button
          type="button"
          aria-label="Добавить тег"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-odoo-text-light transition-colors hover:bg-odoo-bg hover:text-odoo-text"
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Закрыть"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-7 z-50 max-h-[220px] min-w-[200px] overflow-auto rounded-[3px] border border-odoo-border bg-odoo-surface py-1 shadow-lg">
            {rest.map((tag) => (
              <button
                key={tag.id}
                type="button"
                className="block w-full px-3 py-1 text-left text-[13px] text-odoo-text hover:bg-odoo-bg"
                onClick={() => {
                  onChange([...value, tag.id]);
                  setOpen(false);
                }}
              >
                {tag.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
