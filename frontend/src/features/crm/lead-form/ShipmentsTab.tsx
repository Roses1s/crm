/**
 * Вкладка «Заявки» карточки лида: таблица заявок по этому лиду.
 *
 * Собственного состояния и запросов у компонента нет: список приходит
 * готовым через props, нажатие «Добавить заявку» уходит наверх
 * обработчиком. Перенесён из `LeadFormPage.tsx` без изменений разметки:
 * тот же порядок колонок (№, Дата создания, Маршрут, Перевозчик, Статус),
 * те же подписи, классы ячеек, формат даты (`formatShipmentDate`),
 * прочерк вместо пустого перевозчика, подсказка маршрута и ссылка на
 * заявку `/shipments/{id}`.
 *
 * Заголовок вкладки и счётчик «Заявки (N)» остались в странице: их
 * рисует общий `Notebook` из массива вкладок, а не содержимое вкладки.
 *
 * Состояний загрузки и ошибки у блока нет и раньше не было: пока ответ
 * не пришёл или запрос упал, показывается тот же пустой список.
 */
import { Link } from "react-router-dom";

import { formatShipmentDate, SHIPMENT_STATUS } from "@/features/shipments/shipment-status";
import type { ShipmentListItem } from "@/shared/types";

type ShipmentsTabProps = {
  shipments: ShipmentListItem[];
  onAddShipment: () => void;
};

export function ShipmentsTab({ shipments, onAddShipment }: ShipmentsTabProps) {
  return (
    <div className="-mx-4 lg:-mx-6">
      <table className="w-full border-collapse text-[13px] [font-variant-numeric:tabular-nums]">
        <thead>
          <tr>
            <th className="w-[100px] bg-odoo-bg px-2 py-1.5 pl-4 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))] lg:pl-6">
              №
            </th>
            <th className="w-[170px] bg-odoo-bg px-2 py-1.5 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]">
              Дата создания
            </th>
            <th className="bg-odoo-bg px-2 py-1.5 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]">
              Маршрут
            </th>
            <th className="w-[160px] bg-odoo-bg px-2 py-1.5 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]">
              Перевозчик
            </th>
            <th className="w-[180px] bg-odoo-bg px-2 py-1.5 pr-4 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))] lg:pr-6">
              Статус
            </th>
          </tr>
        </thead>
        <tbody>
          {shipments.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-odoo-text-muted lg:px-6">
                Пока нет заявок по этому лиду.
              </td>
            </tr>
          )}
          {shipments.map((s) => {
            const st = SHIPMENT_STATUS[s.status] ?? SHIPMENT_STATUS.new;
            return (
              <tr
                key={s.id}
                className="border-b border-odoo-border-light hover:bg-odoo-surface-hover"
              >
                <td className="px-2 py-1 pl-4 lg:pl-6">
                  <Link className="text-odoo-action hover:underline" to={`/shipments/${s.id}`}>
                    {s.number}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-2 py-1 text-odoo-text-muted">
                  {formatShipmentDate(s.created_at)}
                </td>
                <td className="truncate px-2 py-1" title={s.route}>
                  {s.route}
                </td>
                <td className="truncate px-2 py-1 text-odoo-text-muted">{s.carrier_name || "—"}</td>
                <td className="truncate px-2 py-1 pr-4 lg:pr-6">
                  <span
                    className={`inline-flex rounded-[10px] px-2 py-0.5 text-[11px] font-medium ${st.cls}`}
                  >
                    {st.label}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 pt-2 lg:px-6">
        <button
          type="button"
          // Стрелка, а не голая ссылка на обработчик: иначе React передал
          // бы наружу событие клика, хотя обработчик объявлен без аргументов.
          onClick={() => onAddShipment()}
          className="text-[13px] text-odoo-action hover:underline"
        >
          Добавить заявку
        </button>
      </div>
    </div>
  );
}
