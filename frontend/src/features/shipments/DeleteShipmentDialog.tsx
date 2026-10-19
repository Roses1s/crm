import { Modal } from "@/shared/ui/modal";

/** Подтверждение безвозвратного удаления заявки и всех её данных. */
export function DeleteShipmentDialog({
  shipmentNumber,
  pending,
  error,
  onCancel,
  onConfirm,
}: {
  shipmentNumber: string;
  pending: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal label="Удаление заявки" onClose={onCancel}>
      <div>
        <h3 className="text-[15px] font-semibold text-odoo-text">Удалить заявку безвозвратно?</h3>
        <p className="mt-2 text-[13px] leading-relaxed text-odoo-text-muted">
          Заявка №{shipmentNumber}, её история, документы и теги будут удалены навсегда. Связанный
          лид и остальные его заявки останутся. Если в форме есть несохранённые правки, они тоже
          будут потеряны. Восстановить заявку можно будет только из резервной копии.
        </p>
        <p className="mt-2 text-[12px] text-odoo-text-light">
          В системном журнале останется запись о факте удаления.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-[13px] text-odoo-danger">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={onCancel}
            className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg disabled:opacity-60"
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
