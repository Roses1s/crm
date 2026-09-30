// Свободные теги (чипы с крестиком) — города погрузки/выгрузки, способ погрузки.
// Значения хранятся списком строк; ввод завершается Enter или запятой.
import { X } from "lucide-react";
import { useState } from "react";

export function TokenField({
  value,
  onChange,
  id,
  placeholder,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  id?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const tag = raw.trim().replace(/,+$/, "").trim();
    if (tag && !value.includes(tag)) onChange([...value, tag]);
    setDraft("");
  }

  return (
    <div className="flex w-full flex-wrap items-center gap-1 rounded-[3px] border border-transparent px-1 py-[2px] transition-colors focus-within:border-odoo-focus/40 hover:border-odoo-border">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-[220px] items-center gap-1 rounded-full bg-odoo-tag-blue-bg px-2 py-0.5 text-[11px] leading-[16px] text-odoo-tag-blue-text"
        >
          <span className="truncate" title={tag}>
            {tag}
          </span>
          <button
            type="button"
            aria-label={`Убрать ${tag}`}
            className="opacity-60 transition-opacity hover:opacity-100"
            onClick={() => onChange(value.filter((x) => x !== tag))}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        placeholder={value.length === 0 ? placeholder : ""}
        className="min-w-[80px] flex-1 bg-transparent px-1 py-[1px] text-[13px] leading-[19px] text-odoo-text outline-none placeholder:text-odoo-text-light"
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(",")) commit(v);
          else setDraft(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          } else if (e.key === "Backspace" && draft === "" && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={() => draft && commit(draft)}
      />
    </div>
  );
}
