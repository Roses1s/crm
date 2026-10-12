import { FormStatusbar } from "@/shared/ui/odoo-form";
import type { Stage } from "@/shared/types";

/**
 * Полоса этапов карточки лида: кнопки действий слева и этапы воронки справа.
 *
 * Компонент без собственного состояния и без запросов: значения приходят через
 * props, нажатия уходят наружу обработчиками. «Что делать» решает страница:
 * `onSelectStage` только сообщает выбранный этап, а запрос, проверка конфликта
 * версий, откат и текст ошибки живут в `LeadFormPage.tsx`.
 *
 * Правила перенесены из `LeadFormPage.tsx` дословно (шаг 16В):
 * - кнопок слева нет у новой карточки (`!isNew`), полоса этапов при этом есть;
 * - «Создать заявку» — только у сохранённого непроигранного лида;
 * - у проигранного лида — «Восстановить» владельцу и «Взять себе» остальным,
 *   кнопка блокируется, пока идёт восстановление;
 * - «Проигрыш» — только у активного лида, без блокировки;
 * - этапы блокируются, пока идёт сохранение или карточка «только для чтения»
 *   (`saving || readOnly`): страница передаёт оба признака отдельно, правило
 *   остаётся на виду здесь;
 * - плашка ошибки восстановления (`role="alert"`) показывается только при
 *   непустом тексте и стоит сразу под полосой.
 *
 * Своего `<div>`-обрамления нет: компонент возвращает фрагмент, поэтому панель
 * и плашка остаются соседями в `<main>` страницы — как было до переноса.
 */
type LeadStageBarProps = {
  stages: Stage[];
  /** Выбранный этап карточки; у новой карточки — первый этап воронки. */
  currentStageId?: number;
  isNew: boolean;
  isArchived: boolean;
  /** Лид закреплён за текущим пользователем: от этого зависят подписи кнопок. */
  isOwner: boolean;
  saving: boolean;
  readOnly: boolean;
  restorePending: boolean;
  /** Текст ошибки восстановления; пусто — плашки нет. */
  restoreError: string;
  onSelectStage: (stageId: number) => void;
  onCreateShipment: () => void;
  onRestore: () => void;
  onLose: () => void;
};

export function LeadStageBar({
  stages,
  currentStageId,
  isNew,
  isArchived,
  isOwner,
  saving,
  readOnly,
  restorePending,
  restoreError,
  onSelectStage,
  onCreateShipment,
  onRestore,
  onLose,
}: LeadStageBarProps) {
  return (
    <>
      <FormStatusbar
        items={stages}
        current={currentStageId}
        disabled={saving || readOnly}
        onSelect={onSelectStage}
        left={
          !isNew ? (
            <>
              {!isArchived && (
                <button
                  type="button"
                  onClick={onCreateShipment}
                  className="inline-flex h-[30px] items-center rounded-[4px] bg-odoo-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-odoo-primary-hover"
                >
                  Создать заявку
                </button>
              )}
              {isArchived ? (
                <button
                  type="button"
                  disabled={restorePending}
                  onClick={onRestore}
                  title={
                    isOwner ? "Вернуть лид на доску" : "Забрать лид себе: он перейдёт на вашу доску"
                  }
                  className="h-[30px] rounded-[4px] border border-odoo-border bg-odoo-surface px-3 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg disabled:opacity-60"
                >
                  {restorePending ? "Восстанавливаем…" : isOwner ? "Восстановить" : "Взять себе"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLose}
                  className="h-[30px] rounded-[4px] border border-odoo-border bg-odoo-surface px-3 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg disabled:opacity-60"
                >
                  Проигрыш
                </button>
              )}
            </>
          ) : null
        }
      />
      {restoreError && (
        <div
          role="alert"
          className="mx-4 mt-2 rounded-[4px] border border-odoo-danger/30 bg-odoo-danger/10 px-3 py-2 text-sm text-odoo-danger lg:mx-6"
        >
          {restoreError}
        </div>
      )}
    </>
  );
}
