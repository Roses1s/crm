/**
 * Блок «Информация о погрузке» формы заявки: точка погрузки.
 *
 * Компонент без собственного состояния: значения приходят готовыми через
 * props, правки уходят наверх обработчиками — по одному на поле. Перенесён
 * из `ShipmentFormPage.tsx` без изменений вёрстки, подписей, подсказок
 * и порядка полей; состояние формы, сборка payload и автосохранение
 * остались в странице.
 *
 * Близнец блока «Информация о выгрузке» (`UnloadingGroup`): состав и порядок
 * полей совпадают, различаются только имена полей, id и подписи. Общий
 * компонент на два блока не делаем: решение об объединении принимает владелец.
 */
import { Field, InnerGroup } from "@/shared/ui/odoo-form";

import { TokenField } from "../TokenField";
import { SInput } from "./fields";

type LoadingGroupProps = {
  loadingCities: string[];
  addressLoading: string;
  contactLoadingName: string;
  loadingDateFrom: string;
  loadingDateTo: string;
  loadingTimeFrom: string;
  onLoadingCitiesChange: (next: string[]) => void;
  onAddressLoadingChange: (value: string) => void;
  onContactLoadingNameChange: (value: string) => void;
  onLoadingDateFromChange: (value: string) => void;
  onLoadingDateToChange: (value: string) => void;
  onLoadingTimeFromChange: (value: string) => void;
};

export function LoadingGroup({
  loadingCities,
  addressLoading,
  contactLoadingName,
  loadingDateFrom,
  loadingDateTo,
  loadingTimeFrom,
  onLoadingCitiesChange,
  onAddressLoadingChange,
  onContactLoadingNameChange,
  onLoadingDateFromChange,
  onLoadingDateToChange,
  onLoadingTimeFromChange,
}: LoadingGroupProps) {
  return (
    <div>
      <InnerGroup title="Информация о погрузке">
        <Field label="Города погрузки" htmlFor="ship-load-cities">
          <TokenField
            id="ship-load-cities"
            placeholder="Город + Enter"
            value={loadingCities}
            onChange={(v) => onLoadingCitiesChange(v)}
          />
        </Field>
        <Field label="Адрес погрузки" htmlFor="ship-addr-load">
          <SInput
            id="ship-addr-load"
            value={addressLoading}
            onChange={(e) => onAddressLoadingChange(e.target.value)}
          />
        </Field>
        <Field label="Контактное лицо на погрузке и телефон" htmlFor="ship-load-name">
          <SInput
            id="ship-load-name"
            placeholder="Иванов Иван, +7 900 000-00-00"
            value={contactLoadingName}
            onChange={(e) => onContactLoadingNameChange(e.target.value)}
          />
        </Field>
        <Field label="Дата погрузки с" htmlFor="ship-load-date-from">
          <SInput
            id="ship-load-date-from"
            type="date"
            value={loadingDateFrom}
            onChange={(e) => onLoadingDateFromChange(e.target.value)}
          />
        </Field>
        <Field label="Дата погрузки по" htmlFor="ship-load-date-to">
          <SInput
            id="ship-load-date-to"
            type="date"
            value={loadingDateTo}
            onChange={(e) => onLoadingDateToChange(e.target.value)}
          />
        </Field>
        <Field label="Время" htmlFor="ship-load-time-from">
          <SInput
            id="ship-load-time-from"
            placeholder="09:00"
            value={loadingTimeFrom}
            onChange={(e) => onLoadingTimeFromChange(e.target.value)}
          />
        </Field>
      </InnerGroup>
    </div>
  );
}
