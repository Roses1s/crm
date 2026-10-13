/**
 * Чистые помощники формы заявки: внешний вид поля по его состоянию
 * (заполнено/пусто), ставка НДС и сумма без НДС, перевод даты между
 * сервером и полем `<input type="datetime-local">`.
 *
 * Здесь намеренно нет ни состояния React, ни запросов, ни разметки:
 * форма остаётся про жизненный цикл и вёрстку, а расчёты проверяются
 * обычными тестами. Код перенесён из `ShipmentFormPage.tsx` без изменения
 * поведения.
 */

// Пустое поле почти невидимо (рамка появляется только при наведении или
// фокусе), чтобы не рисовать пустые «коробки» там, где показывать нечего.
// Поле со значением получает мягкую подсветку фоном: с первого взгляда
// видно, что оно заполнено, без слов «не указано» и тире.
const fieldBaseCls =
  "w-full rounded-[3px] border border-transparent px-1.5 py-[3px] text-[13px] leading-[19px] text-odoo-text outline-none transition-colors placeholder:text-odoo-text-light focus:border-odoo-focus/60";
const fieldEmptyCls = "bg-transparent hover:border-odoo-border/50";
const fieldFilledCls = "bg-odoo-primary-soft/50 hover:bg-odoo-primary-soft/70";

/** Классы обычного поля: пустое — без подсветки, заполненное — с ней. */
export function fieldStateCls(filled: boolean) {
  return `${fieldBaseCls} ${filled ? fieldFilledCls : fieldEmptyCls}`;
}

// У <select> браузер рисует собственную стрелку поверх правого края поля.
// При одинаковых отступах слева и справа она наезжала на текст («НДС 22%»
// превращалось в «НДС 22⌄»), поэтому место справа резервируем под неё.
/** Классы выпадающего списка: то же состояние плюс место под стрелку. */
export function selectStateCls(filled: boolean) {
  return `${fieldStateCls(filled)} pr-6`;
}

/** Ставка НДС в процентах. Значения фиксированные: 22% либо «без НДС» (0%);
 *  всё неизвестное трактуется как 0% — правило сохранено прежним. */
export function taxRatePercent(tax: string): number {
  return tax === "vat_22" ? 22 : 0;
}

/** Сумма без НДС выделяется из цены: price / (1 + ставка/100). */
export function netAmount(price: string, tax: string): number | null {
  const value = Number(price);
  if (!price || Number.isNaN(value)) return null;
  return value / (1 + taxRatePercent(tax) / 100);
}

/** ISO-строка с сервера -> локальное время для <input type="datetime-local">
 * (без секунд и часового пояса — именно то, что понимает сам input). */
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Обратное преобразование для отправки на сервер: datetime-local без пояса
 * браузер и спецификация ECMAScript трактуют как локальное время — то же
 * самое, что ввёл человек в поле, без сюрпризов со сдвигом даты. */
export function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}
