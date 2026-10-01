/**
 * Диагональная плашка «ПРОИГРЫШ» в углу карточки — как в Odoo у проигранной
 * сделки. Родитель должен быть `relative overflow-hidden`, иначе уголок
 * вылезет за пределы карточки.
 */
export function LostRibbon() {
  return (
    <div
      aria-label="Лид проигран"
      className="pointer-events-none absolute left-[-42px] top-[18px] z-10 w-[170px] -rotate-45 bg-odoo-danger py-1 text-center text-[11px] font-semibold uppercase tracking-wide text-white shadow-md"
    >
      Проигрыш
    </div>
  );
}
