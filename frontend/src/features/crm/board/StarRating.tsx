/** Приоритет лида звёздами. В макете звёзды некликабельны по умолчанию. */
export function StarRating({ value, onChange }: { value: number; onChange?: (n: number) => void }) {
  return (
    <span
      className="text-[15px] leading-none tracking-tight text-odoo-warning"
      aria-label={`Приоритет: ${value} из 3`}
    >
      {[1, 2, 3].map((n) =>
        onChange ? (
          <button
            key={n}
            type="button"
            className="px-px"
            aria-label={`Приоритет ${n}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(value === n ? 0 : n);
            }}
          >
            {value >= n ? "★" : "☆"}
          </button>
        ) : (
          <span key={n} className="px-px" aria-hidden="true">
            {value >= n ? "★" : "☆"}
          </span>
        ),
      )}
    </span>
  );
}
