import { format } from "date-fns";

/** Статусы заявки по-русски — используется в списке заявок и на вкладке
 *  заявок у лида, чтобы не дублировать перевод в двух местах. */
export const SHIPMENT_STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "Новая", cls: "bg-odoo-tag-yellow-bg text-odoo-tag-yellow-text" },
  checked: {
    label: "Проверена и подписана заявка",
    cls: "bg-odoo-tag-blue-bg text-odoo-tag-blue-text",
  },
  loaded: { label: "Машина загрузилась", cls: "bg-odoo-tag-green-bg text-odoo-tag-green-text" },
  unloaded: {
    label: "Машина выгрузилась",
    cls: "bg-odoo-tag-green-bg text-odoo-tag-green-text",
  },
};

/** Дата создания в формате «12.08.2026 11:55:53». */
export function formatShipmentDate(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : format(date, "dd.MM.yyyy HH:mm:ss");
}
