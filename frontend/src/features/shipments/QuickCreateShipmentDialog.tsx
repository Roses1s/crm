import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Modal } from "@/shared/ui/modal";

import { ApiError } from "@/shared/api/client";
import { useSaveShipment } from "@/shared/api/hooks";
import { TokenField } from "./TokenField";

const inputCls =
  "w-full rounded-[4px] border border-odoo-border bg-odoo-surface px-2 py-1.5 text-[13px] text-odoo-text placeholder:text-odoo-text-light outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus";
const labelCls = "mb-1 block text-[12px] font-medium text-odoo-text";

/**
 * Быстрое создание заявки по кнопке «Создать заявку» на карточке лида —
 * пять обязательных полей вместо полного бланка. Лид уже известен (карточка,
 * с которой открыли диалог), продавец заявке не нужен — он виден через лид.
 * Адреса, контакты, груз, машину и прочее дозаполняют на самой заявке после
 * создания, как и в QuickCreateLeadDialog для лида.
 */
export function QuickCreateShipmentDialog({
  leadId,
  onClose,
}: {
  leadId: number;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  // id=undefined → хук всегда шлёт POST /shipments, не PATCH.
  const createShipment = useSaveShipment(undefined);

  const [loadingCities, setLoadingCities] = useState<string[]>([]);
  const [unloadingCities, setUnloadingCities] = useState<string[]>([]);
  const [loadingDate, setLoadingDate] = useState("");
  const [unloadingDate, setUnloadingDate] = useState("");
  // Перевозчика просто вписывают текстом — любого, без справочника.
  const [carrierName, setCarrierName] = useState("");
  const [carrierInn, setCarrierInn] = useState("");
  const [carrierContact, setCarrierContact] = useState("");
  const [error, setError] = useState("");

  function describe(err: unknown): string {
    if (err instanceof ApiError) return err.message;
    return "Не удалось создать заявку";
  }

  function submit() {
    setError("");
    if (
      loadingCities.length === 0 ||
      unloadingCities.length === 0 ||
      !loadingDate ||
      !unloadingDate ||
      !carrierName.trim()
    ) {
      setError("Заполните все поля — они обязательны");
      return;
    }
    createShipment.mutate(
      {
        lead_id: leadId,
        carrier_name: carrierName.trim(),
        carrier_inn: carrierInn.trim(),
        carrier_contact: carrierContact.trim(),
        loading_cities: loadingCities,
        loading_date_from: loadingDate,
        unloading_cities: unloadingCities,
        unloading_date_from: unloadingDate,
      },
      {
        onSuccess: (created) => navigate(`/shipments/${created.id}`),
        onError: (err) => setError(describe(err)),
      },
    );
  }

  return (
    <Modal label="Новая заявка" onClose={onClose}>
      <form
        className="w-full"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h3 className="text-[15px] font-semibold text-odoo-text">Новая заявка</h3>
        <p className="mt-1 text-[13px] text-odoo-text-muted">
          Адреса, контакты, груз и машину можно добавить на самой заявке сразу после создания.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          <div>
            <label htmlFor="quick-ship-load-cities" className={labelCls}>
              Города погрузки
            </label>
            <TokenField
              id="quick-ship-load-cities"
              value={loadingCities}
              onChange={setLoadingCities}
              placeholder="Город + Enter"
            />
          </div>
          <div>
            <label htmlFor="quick-ship-unload-cities" className={labelCls}>
              Города выгрузки
            </label>
            <TokenField
              id="quick-ship-unload-cities"
              value={unloadingCities}
              onChange={setUnloadingCities}
              placeholder="Город + Enter"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="quick-ship-load-date" className={labelCls}>
                Дата погрузки
              </label>
              <input
                id="quick-ship-load-date"
                required
                type="date"
                className={inputCls}
                value={loadingDate}
                onChange={(e) => setLoadingDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="quick-ship-unload-date" className={labelCls}>
                Дата выгрузки
              </label>
              <input
                id="quick-ship-unload-date"
                required
                type="date"
                className={inputCls}
                value={unloadingDate}
                onChange={(e) => setUnloadingDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="quick-ship-carrier-name" className={labelCls}>
              Перевозчик
            </label>
            <input
              id="quick-ship-carrier-name"
              required
              placeholder="Название компании"
              className={inputCls}
              value={carrierName}
              onChange={(e) => setCarrierName(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="quick-ship-carrier-inn" className={labelCls}>
                ИНН перевозчика
              </label>
              <input
                id="quick-ship-carrier-inn"
                inputMode="numeric"
                placeholder="10 или 12 цифр"
                className={inputCls}
                value={carrierInn}
                onChange={(e) => setCarrierInn(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="quick-ship-carrier-contact" className={labelCls}>
                Контакт перевозчика
              </label>
              <input
                id="quick-ship-carrier-contact"
                className={inputCls}
                value={carrierContact}
                onChange={(e) => setCarrierContact(e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-odoo-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={createShipment.isPending}
            className="h-8 rounded-[4px] bg-odoo-primary px-3 text-sm font-medium text-white transition-colors hover:bg-odoo-primary-hover disabled:opacity-60"
          >
            {createShipment.isPending ? "Создаём…" : "Создать"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
