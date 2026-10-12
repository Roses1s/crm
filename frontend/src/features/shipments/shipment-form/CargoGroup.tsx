/**
 * Блок «Информация о грузе» формы заявки: что везём и на чём.
 *
 * Компонент без собственного состояния: значения приходят готовыми через
 * props, правки уходят наверх обработчиками — по одному на поле. Перенесён
 * из `ShipmentFormPage.tsx` без изменений вёрстки, подписей, порядка полей
 * и вариантов транспорта; состояние формы, сборка payload и автосохранение
 * остались в странице.
 */
import { Field, InnerGroup } from "@/shared/ui/odoo-form";

import { TokenField } from "../TokenField";
import { SInput } from "./fields";
import { selectStateCls } from "./helpers";

// Варианты транспорта нужны только этому блоку — переехали вместе с ним.
const TRANSPORT_OPTIONS: { value: string; label: string }[] = [
  { value: "ft_20", label: "Фура 20т" },
  { value: "ft_40", label: "Фура 40т" },
  { value: "ref", label: "Рефрижератор" },
  { value: "tent", label: "Тент" },
  { value: "gazel", label: "Газель" },
  { value: "other", label: "Другое" },
];

type CargoGroupProps = {
  cargoType: string;
  cargoPackaging: string;
  cargoVolume: string;
  cargoWeight: string;
  capacity: string;
  /** Метки (чипы): тип кузова и способ погрузки. */
  bodyType: string[];
  loadingMethod: string[];
  transportType: string;
  onCargoTypeChange: (value: string) => void;
  onCargoPackagingChange: (value: string) => void;
  onCargoVolumeChange: (value: string) => void;
  onCargoWeightChange: (value: string) => void;
  onCapacityChange: (value: string) => void;
  onBodyTypeChange: (next: string[]) => void;
  onLoadingMethodChange: (next: string[]) => void;
  onTransportTypeChange: (value: string) => void;
};

export function CargoGroup({
  cargoType,
  cargoPackaging,
  cargoVolume,
  cargoWeight,
  capacity,
  bodyType,
  loadingMethod,
  transportType,
  onCargoTypeChange,
  onCargoPackagingChange,
  onCargoVolumeChange,
  onCargoWeightChange,
  onCapacityChange,
  onBodyTypeChange,
  onLoadingMethodChange,
  onTransportTypeChange,
}: CargoGroupProps) {
  return (
    <div>
      <InnerGroup title="Информация о грузе">
        <Field label="Тип груза" htmlFor="ship-cargo-type">
          <SInput
            id="ship-cargo-type"
            value={cargoType}
            onChange={(e) => onCargoTypeChange(e.target.value)}
          />
        </Field>
        <Field label="Упаковка" htmlFor="ship-cargo-pack">
          <SInput
            id="ship-cargo-pack"
            value={cargoPackaging}
            onChange={(e) => onCargoPackagingChange(e.target.value)}
          />
        </Field>
        <Field label="Объём кузова, м³" htmlFor="ship-volume">
          <SInput
            id="ship-volume"
            inputMode="decimal"
            value={cargoVolume}
            onChange={(e) => onCargoVolumeChange(e.target.value)}
          />
        </Field>
        <Field label="Вес груза, т" htmlFor="ship-weight">
          <SInput
            id="ship-weight"
            inputMode="decimal"
            value={cargoWeight}
            onChange={(e) => onCargoWeightChange(e.target.value)}
          />
        </Field>
        <Field label="Грузоподъёмность, т" htmlFor="ship-capacity">
          <SInput
            id="ship-capacity"
            inputMode="decimal"
            value={capacity}
            onChange={(e) => onCapacityChange(e.target.value)}
          />
        </Field>
        <Field label="Тип кузова" htmlFor="ship-body-type">
          <TokenField
            id="ship-body-type"
            placeholder="Например: изотерм + Enter"
            value={bodyType}
            onChange={(v) => onBodyTypeChange(v)}
          />
        </Field>
        <Field label="Способ погрузки" htmlFor="ship-load-method">
          <TokenField
            id="ship-load-method"
            placeholder="Например: задняя + Enter"
            value={loadingMethod}
            onChange={(v) => onLoadingMethodChange(v)}
          />
        </Field>
        <Field label="Тип транспорта" htmlFor="ship-transport">
          <select
            id="ship-transport"
            className={selectStateCls(Boolean(transportType))}
            value={transportType}
            onChange={(e) => onTransportTypeChange(e.target.value)}
          >
            {TRANSPORT_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </InnerGroup>
    </div>
  );
}
