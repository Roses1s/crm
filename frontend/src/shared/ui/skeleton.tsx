/**
 * Заглушка на время загрузки формы: вместо пустого экрана — серые полосы на
 * месте будущих полей. Раньше здесь жили ещё четыре заготовки (для канбана,
 * таблицы и строк списка), но ни один экран их не использовал — удалены
 * 03.10.2026 при разборе мёртвого кода.
 */
export function FormSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-5 w-1/3 rounded-[4px] bg-odoo-skeleton" />
      <div className="space-y-2">
        <div className="h-3 w-20 rounded-[4px] bg-odoo-skeleton" />
        <div className="h-8 w-full rounded-[4px] bg-odoo-skeleton" />
      </div>
    </div>
  );
}
