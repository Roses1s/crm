/**
 * Подтверждение безвозвратного удаления лида.
 *
 * В отличие от архивации (там хватает системного окна браузера — действие
 * обратимо, лид просто уходит в архив) здесь данные стираются насовсем:
 * заявки, переписка и файлы. Поэтому отдельное окно в стиле CRM с явным
 * предупреждением и кнопкой, окрашенной как опасное действие.
 */
import { Modal } from "@/shared/ui/modal";

export function DeleteLeadDialog({
  leadName,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  leadName: string;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal label="Удаление лида" onClose={onCancel}>
      <div>
        <h3 className="text-[15px] font-semibold text-odoo-text">Удалить лид без возврата?</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-odoo-text-muted">
          Карточка «{leadName}», её заявки, документы и переписка будут удалены навсегда.
          Восстановить их будет невозможно.
        </p>
        {error && <p className="mt-3 text-[13px] text-odoo-danger">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg"
          >
            Отмена
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={onConfirm}
            className="h-8 rounded-[4px] bg-odoo-danger px-3 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? "Удаляем…" : "Удалить навсегда"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
