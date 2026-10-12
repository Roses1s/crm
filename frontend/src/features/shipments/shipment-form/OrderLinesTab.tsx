/**
 * Вкладка «Позиции заказа» формы заявки.
 *
 * Компонент без собственного состояния: значения приходят готовыми через
 * props, изменения уходят наверх обработчиками. Расчёты (налог-исключённые
 * суммы и маржа) делает сам рендер из текущих props — как и раньше в
 * `ShipmentFormPage.tsx`, порядок обновления при правке поля не меняется.
 * Перенесён без изменений вёрстки, формул и округления.
 */
import { formatMoney } from "../money";
import { SInput } from "./fields";
import { netAmount, selectStateCls } from "./helpers";

// Позиция заказа: одна фиксированная услуга, цена заказчика и перевозчика —
// каждая со своей ставкой НДС.
const SERVICE_NAME = "Транспортно-экспедиционное обслуживание";

const TAX_OPTIONS: { value: string; label: string }[] = [
  { value: "vat_22", label: "НДС 22%" },
  { value: "no_vat", label: "Без НДС" },
  { value: "vat_0", label: "НДС 0%" },
];

type OrderLinesTabProps = {
  customerPrice: string;
  customerTax: string;
  carrierPrice: string;
  carrierTax: string;
  /** Ставку вычета знает только сервер (GET /meta) — локальной копии нет (Т-08). */
  deductionRate: number | null;
  onCustomerPriceChange: (value: string) => void;
  onCustomerTaxChange: (value: string) => void;
  onCarrierPriceChange: (value: string) => void;
  onCarrierTaxChange: (value: string) => void;
};

/** Вкладка «Позиции заказа»: одна фиксированная строка услуги с ценой
 * заказчика и перевозчика, у каждой свой НДС, плюс итоговая маржа. */
export function OrderLinesTab({
  customerPrice,
  customerTax,
  carrierPrice,
  carrierTax,
  deductionRate,
  onCustomerPriceChange,
  onCustomerTaxChange,
  onCarrierPriceChange,
  onCarrierTaxChange,
}: OrderLinesTabProps) {
  const customerNet = netAmount(customerPrice, customerTax);
  const carrierNet = netAmount(carrierPrice, carrierTax);
  // Из получившейся разницы дополнительно вычитаем долю доп. расходов —
  // по требованию владельца бизнеса (не связанные с НДС). Пока константа
  // не приехала с сервера, живой пересчёт не показываем.
  const margin =
    deductionRate != null && customerNet != null && carrierNet != null
      ? (customerNet - carrierNet) * (1 - deductionRate)
      : null;

  const th = "whitespace-nowrap px-3 py-2 text-left font-semibold";
  const td = "px-3 py-2 align-middle";

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead className="bg-odoo-surface-sunken text-odoo-text-muted">
            <tr className="border-b border-odoo-border">
              <th rowSpan={2} className={th}>
                Продукт
              </th>
              <th colSpan={3} className={`${th} border-l border-odoo-border text-center`}>
                Заказчик
              </th>
              <th colSpan={3} className={`${th} border-l border-odoo-border text-center`}>
                Перевозчик
              </th>
            </tr>
            <tr className="border-b border-odoo-border">
              <th className={`${th} border-l border-odoo-border`}>Цена</th>
              <th className={th}>Налог</th>
              <th className={th}>Налог исключен.</th>
              <th className={`${th} border-l border-odoo-border`}>Цена</th>
              <th className={th}>Налог</th>
              <th className={th}>Налог исключен.</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-odoo-border-light bg-odoo-surface">
              <td className={td}>{SERVICE_NAME}</td>
              <td className={`${td} border-l border-odoo-border`}>
                <SInput
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  aria-label="Цена для заказчика"
                  value={customerPrice}
                  onChange={(e) => onCustomerPriceChange(e.target.value)}
                />
              </td>
              <td className={td}>
                <select
                  className={`${selectStateCls(true)} min-w-[92px]`}
                  value={customerTax}
                  onChange={(e) => onCustomerTaxChange(e.target.value)}
                >
                  {TAX_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className={`${td} text-odoo-text-muted`}>
                {customerNet != null ? formatMoney(customerNet) : ""}
              </td>
              <td className={`${td} border-l border-odoo-border`}>
                <SInput
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  aria-label="Цена для перевозчика"
                  value={carrierPrice}
                  onChange={(e) => onCarrierPriceChange(e.target.value)}
                />
              </td>
              <td className={td}>
                <select
                  className={`${selectStateCls(true)} min-w-[92px]`}
                  value={carrierTax}
                  onChange={(e) => onCarrierTaxChange(e.target.value)}
                >
                  {TAX_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className={`${td} text-odoo-text-muted`}>
                {carrierNet != null ? formatMoney(carrierNet) : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <div className="flex items-center gap-3 px-3 py-2 text-[13px]">
          <span className="font-medium text-odoo-text-muted">Маржа</span>
          <span className="font-semibold text-odoo-text">
            {margin != null ? formatMoney(margin) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
