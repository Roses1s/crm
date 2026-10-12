/**
 * Шапка формы заявки: группа «Заявка» — своя компания, дата создания, лид
 * (или заказчик у уже созданной заявки), ИНН заказчика и контакт заказчика.
 *
 * Компонент без собственного состояния и без запросов: значения приходят
 * готовыми через props, правки уходят наверх обработчиками. Перенесён
 * из `ShipmentFormPage.tsx` без изменений вёрстки, подписей, id, подсказок
 * и порядка полей. Всё остальное осталось в странице: состояние `leadSearch`,
 * запросы `useLeads`/`useLead`, выбор лида (`selectedLead`), обработка ссылки
 * `?lead=`, `set()`, проверки при сохранении, payload и автосохранение.
 *
 * Ветка новой заявки (`isNew`) показывает поиск и список лидов, у созданной
 * заявки вместо них — только показ заказчика. Имя и ИНН заказчика приходят
 * готовыми строками (ИНН может отсутствовать), чтобы источник данных остался
 * в странице.
 */
import { Field, InnerGroup } from "@/shared/ui/odoo-form";

import { selectStateCls } from "./helpers";
import { SInput } from "./fields";

// Наша компания — статичная шапка бланка.
const OWN_COMPANY = 'ООО "Детроид"';

type LeadOption = { id: number; name: string; inn: string };

type ShipmentHeaderGroupProps = {
  isNew: boolean;
  createdAt: string;
  onCreatedAtChange: (value: string) => void;
  leadSearch: string;
  onLeadSearchChange: (value: string) => void;
  leadId: number;
  onLeadIdChange: (id: number) => void;
  leads: LeadOption[];
  selectedLeadDetails?: LeadOption;
  customerName: string;
  customerInn?: string;
  customerContact: string;
  onCustomerContactChange: (value: string) => void;
};

export function ShipmentHeaderGroup({
  isNew,
  createdAt,
  onCreatedAtChange,
  leadSearch,
  onLeadSearchChange,
  leadId,
  onLeadIdChange,
  leads,
  selectedLeadDetails,
  customerName,
  customerInn,
  customerContact,
  onCustomerContactChange,
}: ShipmentHeaderGroupProps) {
  return (
    <div>
      <InnerGroup title="Заявка">
        <Field label="Компания">
          <span className="px-1.5 py-[3px] text-odoo-text">{OWN_COMPANY}</span>
        </Field>
        <Field label="Дата создания" htmlFor="ship-created-at">
          <SInput
            id="ship-created-at"
            type="datetime-local"
            value={createdAt}
            onChange={(e) => onCreatedAtChange(e.target.value)}
          />
        </Field>
        {isNew ? (
          <Field label="Лид" htmlFor="ship-lead-select">
            <div className="space-y-1">
              <SInput
                aria-label="Поиск лида"
                placeholder="Поиск по названию или ИНН"
                value={leadSearch}
                onChange={(e) => onLeadSearchChange(e.target.value)}
              />
              <select
                id="ship-lead-select"
                className={selectStateCls(Boolean(leadId))}
                value={leadId || ""}
                onChange={(e) => onLeadIdChange(Number(e.target.value) || 0)}
              >
                <option value="">Выберите лид</option>
                {selectedLeadDetails &&
                  !leads.some((lead) => lead.id === selectedLeadDetails.id) && (
                    <option value={selectedLeadDetails.id}>
                      {selectedLeadDetails.name} · {selectedLeadDetails.inn}
                    </option>
                  )}
                {leads.map((lead) => (
                  <option key={lead.id} value={lead.id}>
                    {lead.name} · {lead.inn}
                  </option>
                ))}
              </select>
            </div>
          </Field>
        ) : (
          <Field label="Заказчик">
            <span className="px-1.5 py-[3px] text-odoo-text">{customerName}</span>
          </Field>
        )}
        <Field label="ИНН заказчика">
          <span className="px-1.5 py-[3px] text-odoo-text-muted">{customerInn}</span>
        </Field>
        <Field label="Контакт заказчика" htmlFor="ship-cust-contact">
          <SInput
            id="ship-cust-contact"
            value={customerContact}
            onChange={(e) => onCustomerContactChange(e.target.value)}
          />
        </Field>
      </InnerGroup>
    </div>
  );
}
