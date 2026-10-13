/**
 * Блок «Сведения о перевозчике» формы заявки: кто везёт и на чём.
 *
 * Собственного состояния у компонента нет: значения приходят готовыми
 * через props, правки уходят наверх обработчиками — по одному на поле.
 * Перенесён из `ShipmentFormPage.tsx` без изменений вёрстки, подписей,
 * подсказок, порядка полей и условия показа «Номера прицепа»; состояние
 * формы, сборка payload и автосохранение остались в странице.
 */
import { Field, InnerGroup, OdooCheckbox } from "@/shared/ui/odoo-form";

import { SInput } from "./fields";

type CarrierGroupProps = {
  carrierName: string;
  carrierInn: string;
  carrierContact: string;
  vehicle: string;
  vehicleNumber: string;
  hasTrailer: boolean;
  trailerNumber: string;
  driverName: string;
  driverPhone: string;
  driverPassport: string;
  carrierSigner: string;
  onCarrierNameChange: (value: string) => void;
  onCarrierInnChange: (value: string) => void;
  onCarrierContactChange: (value: string) => void;
  onVehicleChange: (value: string) => void;
  onVehicleNumberChange: (value: string) => void;
  onHasTrailerChange: (next: boolean) => void;
  onTrailerNumberChange: (value: string) => void;
  onDriverNameChange: (value: string) => void;
  onDriverPhoneChange: (value: string) => void;
  onDriverPassportChange: (value: string) => void;
  onCarrierSignerChange: (value: string) => void;
};

export function CarrierGroup({
  carrierName,
  carrierInn,
  carrierContact,
  vehicle,
  vehicleNumber,
  hasTrailer,
  trailerNumber,
  driverName,
  driverPhone,
  driverPassport,
  carrierSigner,
  onCarrierNameChange,
  onCarrierInnChange,
  onCarrierContactChange,
  onVehicleChange,
  onVehicleNumberChange,
  onHasTrailerChange,
  onTrailerNumberChange,
  onDriverNameChange,
  onDriverPhoneChange,
  onDriverPassportChange,
  onCarrierSignerChange,
}: CarrierGroupProps) {
  return (
    <div>
      <InnerGroup title="Сведения о перевозчике">
        <Field label="Перевозчик" htmlFor="ship-carrier-name">
          {/* Перевозчика просто вписывают текстом — любого,
          без выбора из справочника (справочника больше нет). */}
          <SInput
            id="ship-carrier-name"
            placeholder="Название компании"
            value={carrierName}
            onChange={(e) => onCarrierNameChange(e.target.value)}
          />
        </Field>
        <Field label="ИНН перевозчика" htmlFor="ship-carrier-inn">
          <SInput
            id="ship-carrier-inn"
            inputMode="numeric"
            placeholder="10 или 12 цифр"
            value={carrierInn}
            onChange={(e) => onCarrierInnChange(e.target.value)}
          />
        </Field>
        <Field label="Контакт перевозчика" htmlFor="ship-carr-contact">
          <SInput
            id="ship-carr-contact"
            value={carrierContact}
            onChange={(e) => onCarrierContactChange(e.target.value)}
          />
        </Field>
        <Field label="ТС (марка)" htmlFor="ship-vehicle">
          <SInput
            id="ship-vehicle"
            value={vehicle}
            onChange={(e) => onVehicleChange(e.target.value)}
          />
        </Field>
        <Field label="Номер ТС" htmlFor="ship-vehicle-num">
          <SInput
            id="ship-vehicle-num"
            value={vehicleNumber}
            onChange={(e) => onVehicleNumberChange(e.target.value)}
          />
        </Field>
        <Field label="Прицеп" htmlFor="ship-has-trailer">
          <OdooCheckbox
            id="ship-has-trailer"
            label="Есть прицеп"
            checked={hasTrailer}
            onChange={(v) => onHasTrailerChange(v)}
          />
        </Field>
        {hasTrailer && (
          <Field label="Номер прицепа" htmlFor="ship-trailer-num">
            <SInput
              id="ship-trailer-num"
              value={trailerNumber}
              onChange={(e) => onTrailerNumberChange(e.target.value)}
            />
          </Field>
        )}
        <Field label="ФИО водителя" htmlFor="ship-driver-name">
          <SInput
            id="ship-driver-name"
            value={driverName}
            onChange={(e) => onDriverNameChange(e.target.value)}
          />
        </Field>
        <Field label="Телефон водителя" htmlFor="ship-driver-phone">
          <SInput
            id="ship-driver-phone"
            placeholder="+7 900 000-00-00"
            value={driverPhone}
            onChange={(e) => onDriverPhoneChange(e.target.value)}
          />
        </Field>
        <Field label="Паспорт водителя" htmlFor="ship-driver-pass">
          <SInput
            id="ship-driver-pass"
            value={driverPassport}
            onChange={(e) => onDriverPassportChange(e.target.value)}
          />
        </Field>
        <Field label="Кто подписывает" htmlFor="ship-carr-signer">
          <SInput
            id="ship-carr-signer"
            value={carrierSigner}
            onChange={(e) => onCarrierSignerChange(e.target.value)}
          />
        </Field>
      </InnerGroup>
    </div>
  );
}
