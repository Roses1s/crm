/**
 * Форматирование денег для таблицы заявок: колонки «Маржа» и «Всего»,
 * строка «Итого».
 *
 * С сервера значения приходят строками (Decimal сериализуется в JSON как
 * строка, чтобы не терять точность). Число тоже принимаем — так же этой
 * функцией пользуется живой расчёт маржи в карточке заявки, и формат в
 * списке и в карточке не может разъехаться.
 */

/** «12 345,67»; null/пустое значение — цен нет, показываем прочерк. */
export function formatMoney(value: string | number | null | undefined): string {
  const num =
    typeof value === "number" ? value : value != null && value !== "" ? Number(value) : Number.NaN;
  if (Number.isNaN(num)) return "—";
  return num.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
