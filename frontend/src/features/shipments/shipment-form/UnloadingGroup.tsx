/**
 * Блок «Информация о выгрузке» формы заявки: точка выгрузки.
 *
 * Собственного состояния у компонента нет: значения приходят готовыми
 * через props, правки уходят наверх обработчиками — по одному на поле.
 * Перенесён
 * из `ShipmentFormPage.tsx` без изменений вёрстки, подписей, подсказок
 * и порядка полей; состояние формы, сборка payload и автосохранение
 * остались в странице.
 */
import { Field, InnerGroup } from "@/shared/ui/odoo-form";

import { TokenField } from "../TokenField";
import { SInput } from "./fields";

type UnloadingGroupProps = {
  unloadingCities: string[];
  addressUnloading: string;
  contactUnloadingName: string;
  unloadingDateFrom: string;
  unloadingDateTo: string;
  unloadingTimeFrom: string;
  onUnloadingCitiesChange: (next: string[]) => void;
  onAddressUnloadingChange: (value: string) => void;
  onContactUnloadingNameChange: (value: string) => void;
  onUnloadingDateFromChange: (value: string) => void;
  onUnloadingDateToChange: (value: string) => void;
  onUnloadingTimeFromChange: (value: string) => void;
};

export function UnloadingGroup({
  unloadingCities,
  addressUnloading,
  contactUnloadingName,
  unloadingDateFrom,
  unloadingDateTo,
  unloadingTimeFrom,
  onUnloadingCitiesChange,
  onAddressUnloadingChange,
  onContactUnloadingNameChange,
  onUnloadingDateFromChange,
  onUnloadingDateToChange,
  onUnloadingTimeFromChange,
}: UnloadingGroupProps) {
  return (
    <div>
      <InnerGroup title="Информация о выгрузке">
        <Field label="Города выгрузки" htmlFor="ship-unload-cities">
          <TokenField
            id="ship-unload-cities"
            placeholder="Город + Enter"
            value={unloadingCities}
            onChange={(v) => onUnloadingCitiesChange(v)}
          />
        </Field>
        <Field label="Адрес выгрузки" htmlFor="ship-addr-unload">
          <SInput
            id="ship-addr-unload"
            value={addressUnloading}
            onChange={(e) => onAddressUnloadingChange(e.target.value)}
          />
        </Field>
        <Field label="Контактное лицо на выгрузке и телефон" htmlFor="ship-unload-name">
          <SInput
            id="ship-unload-name"
            placeholder="Иванов Иван, +7 900 000-00-00"
            value={contactUnloadingName}
            onChange={(e) => onContactUnloadingNameChange(e.target.value)}
          />
        </Field>
        <Field label="Дата выгрузки с" htmlFor="ship-unload-date-from">
          <SInput
            id="ship-unload-date-from"
            type="date"
            value={unloadingDateFrom}
            onChange={(e) => onUnloadingDateFromChange(e.target.value)}
          />
        </Field>
        <Field label="Дата выгрузки по" htmlFor="ship-unload-date-to">
          <SInput
            id="ship-unload-date-to"
            type="date"
            value={unloadingDateTo}
            onChange={(e) => onUnloadingDateToChange(e.target.value)}
          />
        </Field>
        <Field label="Время" htmlFor="ship-unload-time-from">
          <SInput
            id="ship-unload-time-from"
            placeholder="09:00"
            value={unloadingTimeFrom}
            onChange={(e) => onUnloadingTimeFromChange(e.target.value)}
          />
        </Field>
      </InnerGroup>
    </div>
  );
}
