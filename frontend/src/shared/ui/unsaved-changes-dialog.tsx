import { Modal } from "@/shared/ui/modal";

/** Диалог перехода со страницы, пока форма ждёт автосохранения. */
export function UnsavedChangesDialog({
  saving,
  canSave = true,
  error,
  onSaveAndLeave,
  onLeaveWithoutSaving,
  onStay,
}: {
  saving: boolean;
  canSave?: boolean;
  error?: string;
  onSaveAndLeave: () => void;
  onLeaveWithoutSaving: () => void;
  onStay: () => void;
}) {
  return (
    <Modal label="Несохранённые изменения" onClose={onStay} zClassName="z-[80]">
      <h2 className="text-[16px] font-semibold text-odoo-text">Есть несохранённые изменения</h2>
      <p className="mt-2 text-[13px] leading-5 text-odoo-text-muted">
        Сохранить их перед переходом на другую страницу?
      </p>
      {saving && (
        <p className="mt-2 text-[12px] text-odoo-text-muted" role="status">
          Сохранение уже выполняется. Можно дождаться его завершения.
        </p>
      )}
      {error && (
        <p className="mt-2 text-[12px] text-odoo-danger" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <button
          type="button"
          disabled={!canSave}
          onClick={onSaveAndLeave}
          className="h-8 rounded-[3px] bg-odoo-primary px-3 text-[13px] font-medium text-white hover:bg-odoo-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Дождаться и перейти" : "Сохранить и перейти"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onLeaveWithoutSaving}
          className="h-8 rounded-[3px] border border-odoo-border px-3 text-[13px] text-odoo-text hover:bg-odoo-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          Уйти без сохранения
        </button>
        <button
          type="button"
          onClick={onStay}
          className="h-8 rounded-[3px] border border-odoo-border px-3 text-[13px] text-odoo-text hover:bg-odoo-bg"
        >
          Остаться
        </button>
      </div>
    </Modal>
  );
}
