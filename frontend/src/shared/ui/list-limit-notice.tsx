/**
 * Честное предупреждение «показаны не все записи».
 *
 * Списки запрашивают у сервера первую страницу (200 записей, клиенты — 500) и
 * постраничного перелистывания в интерфейсе нет. Раньше остальные записи
 * просто исчезали: пользователь видел 200 лидов из 240 и не знал об этом.
 * Теперь над списком появляется полоска с настоящим количеством и подсказкой
 * сузить поиск.
 */
import type { ListResult } from "@/shared/api/hooks";

export function ListLimitNotice<T>({
  data,
  noun,
}: {
  data: ListResult<T> | undefined;
  /** Что считаем — для текста: «лидов», «заявок», «клиентов». */
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
