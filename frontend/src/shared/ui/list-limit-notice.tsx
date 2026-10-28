/**
 * Предупреждение для одноразового ограниченного списка, когда сервер сообщает,
 * что подходящих записей больше, чем вернула первая страница. Основные списки
 * CRM используют постраничную загрузку и собственные кнопки «Показать ещё»;
 * для них этот компонент не заменяет управление страницами.
 */
import type { ListResult } from "@/shared/api/hooks";

export function ListLimitNotice<T>({
  data,
  noun,
}: {
  data: ListResult<T> | undefined;
  /** Что считаем, для текста: «лидов», «заявок», «клиентов». */
  noun: string;
}) {
  if (!data || data.total <= data.items.length) return null;

  return (
    <div
      role="status"
      className="mx-3 mb-2 rounded-[4px] border border-odoo-warning/40 bg-odoo-warning/10 px-3 py-2 text-[12px] text-odoo-text"
    >
      Показаны первые {data.items.length} {noun} из {data.total}. Уточните поиск или фильтр, чтобы
      увидеть остальные.
    </div>
  );
}
