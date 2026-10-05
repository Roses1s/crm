import { isValidHexColor } from "./tag-styles";

// Быстрые пресеты — старые 6 цветов тегов (теперь просто HEX, без привязки
// к конкретному имени), плюс чуть расширенная палитра. Цвет всё равно
// свободный: пресеты — только для скорости, не ограничение.
const PRESETS = [
  "#1a5276",
  "#1e8449",
  "#922b21",
  "#7d6608",
  "#6c3483",
  "#935116",
  "#616161",
  "#0e7490",
  "#be185d",
  "#15803d",
];

/** Пресеты-кружки + нативный `<input type="color">` для произвольного HEX. */
export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const safeValue = isValidHexColor(value) ? value : "#3b82f6";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {PRESETS.map((hex) => (
        <button
          key={hex}
          type="button"
          aria-label={`Цвет ${hex}`}
          title={hex}
          onClick={() => onChange(hex)}
          className={`h-5 w-5 shrink-0 rounded-full ring-offset-1 ring-offset-odoo-surface transition-shadow ${
            value.toLowerCase() === hex
              ? "ring-2 ring-odoo-focus"
              : "hover:ring-1 hover:ring-odoo-border"
          }`}
          style={{ backgroundColor: hex }}
        />
      ))}
      <label
        className="relative flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-odoo-border text-odoo-text-light"
        title="Свой цвет"
      >
        <input
          type="color"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Свой цвет"
        />
        <span
          className="pointer-events-none h-3.5 w-3.5 rounded-full"
          style={{ backgroundColor: safeValue }}
        />
      </label>
    </div>
  );
}
