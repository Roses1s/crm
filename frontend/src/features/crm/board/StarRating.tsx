import { useState } from "react";

/** Приоритет лида звёздами. В макете звёзды некликабельны по умолчанию. */
export function StarRating({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  const [preview, setPreview] = useState<number | null>(null);
  const displayedValue = preview ?? value;

  return (
    <span
      className="text-[15px] leading-none tracking-tight"
      aria-label={`Приоритет: ${value} из 3`}
      onMouseLeave={onChange ? () => setPreview(null) : undefined}
    >
      {[1, 2, 3].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            className={`px-px ${displayedValue >= n ? "text-odoo-warning" : "text-odoo-text-muted"}`}
            aria-label={`Приоритет ${n}`}
            onMouseEnter={() => setPreview(n)}
            onFocus={() => setPreview(n)}
            onBlur={() => setPreview(null)}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setPreview(null);
              onChange(value === n ? 0 : n);
            }}
          >
            {displayedValue >= n ? "★" : "☆"}
          </button>
        ) : (
          <span
            key={n}
            className={`px-px ${value >= n ? "text-odoo-warning" : "text-odoo-text-muted"}`}
            aria-hidden="true"
          >
            {value >= n ? "★" : "☆"}
          </span>
        ),
      )}
    </span>
  );
}
