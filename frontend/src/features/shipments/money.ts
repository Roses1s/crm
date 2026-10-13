/**
 * Форматирование денег для таблицы заявок: колонки «Маржа» и «Всего»,
 * строка «Итого».
 *
 * С сервера значения приходят строками (Decimal сериализуется в JSON
 * строкой, чтобы не терять точность). Число тоже принимаем: этой же
 * функцией пользуется живой расчёт маржи в карточке заявки, и формат в
 * списке и в карточке не может разъехаться.
 */

/** «12 345,67»; при null или пустом значении цен нет — показываем
 *  прочерк. */
export function formatMoney(value: string | number | null | undefined): string {
  const num =
    typeof value === "number" ? value : value != null && value !== "" ? Number(value) : Number.NaN;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
