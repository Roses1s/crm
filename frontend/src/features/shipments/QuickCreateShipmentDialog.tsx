import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/shared/api/client";
import { useCarriers, useSaveShipment } from "@/shared/api/hooks";
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
  const { data: carriers = [] } = useCarriers();
  // id=undefined → хук всегда шлёт POST /shipments, не PATCH.
  const createShipment = useSaveShipment(undefined);

  const [loadingCities, setLoadingCities] = useState<string[]>([]);
  const [unloadingCities, setUnloadingCities] = useState<string[]>([]);
  const [loadingDate, setLoadingDate] = useState("");
  const [unloadingDate, setUnloadingDate] = useState("");
  const [carrierId, setCarrierId] = useState<number | "">("");
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
      !carrierId
    ) {
      setError("Заполните все поля — они обязательны");
      return;
    }
    createShipment.mutate(
      {
        lead_id: leadId,
        carrier_id: Number(carrierId),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-odoo-overlay/30 p-4">
      <form
        className="w-full max-w-md rounded-lg bg-odoo-surface p-4 shadow-lg"
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
            <label htmlFor="quick-ship-carrier" className={labelCls}>
              Перевозчик
            </label>
            <select
              id="quick-ship-carrier"
              required
              className={inputCls}
              value={carrierId}
              onChange={(e) => setCarrierId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">Выберите перевозчика</option>
              {carriers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {carriers.length === 0 && (
              <p className="mt-1 text-[12px] text-odoo-text-muted">
                Перевозчиков пока нет — добавьте в «Администрирование → Перевозчики».
              </p>
            )}
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
    </div>
  );
}
