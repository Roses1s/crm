/**
 * Блок «Информация о компании» карточки лида: название компании, ИНН
 * с предупреждением о дубле, продавец и причина проигрыша.
 *
 * Компонент без собственного состояния: значения приходят готовыми через
 * props, правки уходят наверх обработчиками. Перенесён из `LeadFormPage.tsx`
 * без изменений вёрстки, подписей, id, подсказок, порядка полей и правил
 * доступности кнопки «Продавец».
 *
 * Своей обёртки-колонки у компонента нет: в странице он и группа
 * «бухгалтер/приоритет/теги» лежат в одной общей ячейке `<div>`, поэтому
 * лишний уровень разметки не добавляется.
 *
 * Роль пользователя компонент НЕ вычисляет: страница передаёт готовый флаг
 * `isAdmin` (`currentUser?.role === "admin"`). Правила кнопки перенесены
 * дословно: `disabled = isNew || (readOnly && !isAdmin)`, подсказка выбирается
 * той же лестницей `isNew → readOnly && !isAdmin → обычная`.
 *
 * `readOnly` и `isArchived` — разные пропсы: первый запрещает правку (в него
 * входят и проигранный лид, и конфликт версий), второй только показывает
 * строку «Причина проигрыша». Название компании — то же поле, что и крупный
 * заголовок листа: отдельного поля в базе у него нет.
 */
import { Field, InnerGroup, OdooInput } from "@/shared/ui/odoo-form";
import type { Customer } from "@/shared/types";

type CompanyGroupProps = {
  name: string;
  inn: string;
  /** Совпадения по ИНН в других лидах: пусто — предупреждение не показывается. */
  sameInn: Customer[];
  owner: string;
  ownerAvatar: string;
  isNew: boolean;
  readOnly: boolean;
  isAdmin: boolean;
  isArchived: boolean;
  lossReasonName: string | null;
  onNameChange: (value: string) => void;
  onInnChange: (value: string) => void;
  onOpenTransfer: () => void;
};

export function CompanyGroup({
  name,
  inn,
  sameInn,
  owner,
  ownerAvatar,
  isNew,
  readOnly,
  isAdmin,
  isArchived,
  lossReasonName,
  onNameChange,
  onInnChange,
  onOpenTransfer,
}: CompanyGroupProps) {
  return (
    <InnerGroup title="Информация о компании">
      <Field label="Компания" htmlFor="lead-company">
        {/*
          «Компания» показывает и редактирует то же название,
          что и крупный заголовок сверху (одно поле form.name),
          без отдельного поля в базе.
        */}
        <OdooInput
          id="lead-company"
          placeholder="например, ООО «Ромашка»"
          value={name}
          disabled={readOnly}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </Field>
      <Field
        label="ИНН"
        htmlFor="lead-inn"
        help="10 или 12 цифр, проверяется контрольная сумма ФНС"
      >
        <OdooInput
          id="lead-inn"
          inputMode="numeric"
          placeholder="10 или 12 цифр"
          value={inn}
          disabled={readOnly}
          onChange={(e) => onInnChange(e.target.value)}
        />
      </Field>
      {sameInn.length > 0 && (
        <p
          role="alert"
          className="rounded-[4px] bg-odoo-tag-yellow-bg px-2.5 py-2 text-[12px] leading-5 text-odoo-tag-yellow-text"
        >
          Лид с таким ИНН уже есть: «{sameInn[0].name}»
          {sameInn[0].assigned_to_name ? `, ответственный — ${sameInn[0].assigned_to_name}` : ""}.
          Это просто предупреждение, сохранить можно.
        </p>
      )}
      <Field label="Продавец">
        {/* Щелчок по имени открывает передачу лида коллеге. */}
        <button
          type="button"
          disabled={isNew || (readOnly && !isAdmin)}
          onClick={() => onOpenTransfer()}
          title={
            isNew
              ? "Сначала сохраните лид"
              : readOnly && !isAdmin
                ? "Сначала восстановите лид, чтобы передать его"
                : "Передать лид другому сотруднику"
          }
          className="flex w-full items-center gap-1.5 rounded-[4px] pt-[2px] text-left transition-colors hover:bg-odoo-bg disabled:cursor-default disabled:hover:bg-transparent"
        >
          {owner ? (
            <>
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-odoo-primary text-[9px] font-semibold text-white">
                {ownerAvatar}
              </span>
              <span className="truncate">{owner}</span>
            </>
          ) : (
            <span className="text-odoo-text-light">Не назначен</span>
          )}
        </button>
      </Field>
      {isArchived && (
        <Field label="Причина проигрыша">
          <span className="pt-[2px] text-odoo-text">{lossReasonName || "—"}</span>
        </Field>
      )}
    </InnerGroup>
  );
}
