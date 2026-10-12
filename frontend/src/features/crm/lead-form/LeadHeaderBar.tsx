import { ChevronLeft, ChevronRight, FileText, Settings } from "lucide-react";

import { ControlPanel } from "@/app/layout/AppShell";
import { FormStatusIndicator } from "@/shared/ui/odoo-form";
import type { Pager } from "@/shared/types";

/**
 * Шапка карточки лида: кнопка «Новый», «хлебные крошки», «Сохранить» и
 * «Отменить», меню «Действия», «Все заявки» и листалка соседних лидов.
 *
 * Компонент без собственного состояния и без запросов: открытие окон и меню —
 * это состояние страницы, оно приходит готовым (`actionsOpen`) и меняется
 * через `onActionsOpenChange`. «Что делать» решает страница: компонент только
 * показывает и отдаёт нажатия наружу.
 *
 * Правила перенесены из `LeadFormPage.tsx` дословно (шаг 16Б):
 * - шестерёнка «Действия», «Все заявки» и листалка — только у сохранённой
 *   карточки (`!isNew`); у новой карточки их нет;
 * - пункт «Отметить проигрышем» — только у активного лида, «Удалить лид» —
 *   только администратору и блокируется, пока идёт удаление;
 * - кнопки листалки блокируются, когда соседа нет (`prev_id`/`next_id`);
 * - «Сохранить/Отменить» видны только при несохранённых правках и не в
 *   карточке «только для чтения» (`dirty && !readOnly`).
 *
 * Своего `<div>`-обрамления нет: компонент возвращает сам `ControlPanel`,
 * который рисует панель управления целиком, — иначе изменилась бы разметка.
 */
export function LeadHeaderBar({
  leadName,
  isNew,
  isArchived,
  isAdmin,
  dirty,
  readOnly,
  saving,
  actionsOpen,
  deletePending,
  shipmentsCount,
  pager,
  onNew,
  onSave,
  onDiscard,
  onActionsOpenChange,
  onOpenLose,
  onOpenDelete,
  onPrevLead,
  onNextLead,
}: {
  /** Название лида для «хлебных крошек»; пустое — «Новый лид». */
  leadName: string;
  /** Карточка ещё не сохранена: прячет меню, счётчик заявок и листалку. */
  isNew: boolean;
  /** Лид проигран: прячет пункт «Отметить проигрышем». */
  isArchived: boolean;
  /** Пользователь — администратор: показывает пункт «Удалить лид». */
  isAdmin: boolean;
  /** В форме есть несохранённые правки. */
  dirty: boolean;
  /** Карточка только для чтения (проиграна или конфликт версий). */
  readOnly: boolean;
  /** Сохранение идёт: кнопки «Сохранить/Отменить» заблокированы. */
  saving: boolean;
  /** Меню «Действия» открыто (состояние живёт на странице). */
  actionsOpen: boolean;
  /** Удаление лида выполняется: пункт меню заблокирован. */
  deletePending: boolean;
  /** Сколько заявок у лида — число в блоке «Все заявки». */
  shipmentsCount: number;
  /** Листалка соседних лидов; `null` — данных ещё нет. */
  pager: Pager | null;
  /** Нажатие «Новый». */
  onNew: () => void;
  /** Нажатие «Сохранить». */
  onSave: () => void;
  /** Нажатие «Отменить». */
  onDiscard: () => void;
  /** Открыть (`true`) или закрыть (`false`) меню «Действия». */
  onActionsOpenChange: (open: boolean) => void;
  /** Выбран пункт «Отметить проигрышем». */
  onOpenLose: () => void;
  /** Выбран пункт «Удалить лид». */
  onOpenDelete: () => void;
  /** Нажатие «Предыдущий лид». */
  onPrevLead: () => void;
  /** Нажатие «Следующий лид». */
  onNextLead: () => void;
}) {
  return (
    <ControlPanel
      onNew={() => onNew()}
      crumbs={[{ label: "Лиды", to: "/crm" }, { label: leadName || "Новый лид" }]}
      status={
        <FormStatusIndicator
          dirty={dirty && !readOnly}
          saving={saving}
          onSave={() => onSave()}
          onDiscard={() => onDiscard()}
        />
      }
      cog={
        !isNew ? (
          <span className="relative inline-flex">
            <button
              type="button"
              aria-label="Действия"
              title="Действия"
              className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-odoo-text-muted transition-colors hover:bg-odoo-bg hover:text-odoo-text"
              onClick={() => onActionsOpenChange(!actionsOpen)}
            >
              <Settings className="h-4 w-4" />
            </button>
            {actionsOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Закрыть"
                  onClick={() => onActionsOpenChange(false)}
                />
                <div className="absolute left-0 top-6 z-50 min-w-[180px] rounded-[3px] border border-odoo-border bg-odoo-surface py-1 shadow-lg">
                  {!isArchived && (
                    <button
                      type="button"
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-odoo-text hover:bg-odoo-bg disabled:opacity-60"
                      onClick={() => onOpenLose()}
                    >
                      Отметить проигрышем
                    </button>
                  )}
                  {isAdmin && (
                    <button
                      type="button"
                      disabled={deletePending}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-odoo-danger hover:bg-odoo-bg disabled:opacity-60"
                      onClick={() => onOpenDelete()}
                    >
                      Удалить лид
                    </button>
                  )}
                </div>
              </>
            )}
          </span>
        ) : null
      }
      stats={
        !isNew ? (
          <span className="inline-flex h-[34px] items-center gap-2 rounded-[4px] border border-odoo-border bg-odoo-surface px-2.5">
            <FileText className="h-4 w-4 text-odoo-text-muted" />
            <span className="flex flex-col items-start leading-[13px]">
              <span className="text-[12px] text-odoo-text">Все заявки</span>
              <span className="text-[11px] text-odoo-text-muted">{shipmentsCount}</span>
            </span>
          </span>
        ) : null
      }
      pager={
        !isNew && pager ? (
          <span className="flex items-center gap-1">
            <span className="whitespace-nowrap text-[13px] text-odoo-text-muted [font-variant-numeric:tabular-nums]">
              {pager.position} / {pager.total}
            </span>
            <span className="inline-flex h-7 overflow-hidden rounded-[4px] border border-odoo-border bg-odoo-surface">
              <button
                type="button"
                aria-label="Предыдущий лид"
                disabled={!pager.prev_id}
                onClick={() => onPrevLead()}
                className="inline-flex w-7 items-center justify-center text-odoo-text-muted transition-colors hover:bg-odoo-bg disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Следующий лид"
                disabled={!pager.next_id}
                onClick={() => onNextLead()}
                className="inline-flex w-7 items-center justify-center border-l border-odoo-border text-odoo-text-muted transition-colors hover:bg-odoo-bg disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </span>
          </span>
        ) : null
      }
    />
  );
}
