import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell, Breadcrumb, Toolbar } from "@/app/layout/AppShell";
import { useCarriers, useLeads, useShipment } from "@/shared/api/hooks";
import { Button } from "@/shared/ui/button";
import { Chatter } from "@/shared/ui/chatter";
import { FormSection } from "@/shared/ui/form-section";

const STATUSES = ["new", "in_progress", "in_transit", "delivered", "cancelled"] as const;
const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  in_transit: "В пути",
  delivered: "Доставлена",
  cancelled: "Отменена",
};

const inputCls = "w-full rounded-[4px] border border-odoo-border px-2.5 py-1.5 text-sm";
const labelCls = "mb-1 block text-xs font-medium uppercase text-odoo-text-muted";

/**
 * Карточка заявки. Данные читаются из API; сохранение и смена статуса
 * подключаются следующим шагом — сейчас поля редактируются локально.
 */
export function ShipmentFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { data: shipment } = useShipment(id);
  const { data: carriers = [] } = useCarriers();
  const { data: leads = [] } = useLeads();
  const selectedLead = shipment ? leads.find((l) => l.id === shipment.lead_id) : undefined;

  return (
    <AppShell>
      <Breadcrumb items={["Заявки", isNew ? "Новая" : `#${id}`]} />
      <Toolbar>
        <Button variant="secondary" onClick={() => navigate("/shipments")}>
          Назад
        </Button>
        {!isNew && selectedLead && (
          <Link to={`/crm/leads/${selectedLead.id}`} className="text-sm text-odoo-action">
            Лид: {selectedLead.name}
          </Link>
        )}
        <span className="ml-auto" />
        <Button>Сохранить</Button>
      </Toolbar>
      <div className="flex min-h-[calc(100vh-140px)] flex-col lg:flex-row">
        <div className="flex-1 p-4">
          {!isNew && (
            <div className="mb-4 flex flex-wrap gap-1">
              {STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`px-3 py-1.5 text-xs font-medium ${
                    shipment?.status === st
                      ? "bg-odoo-primary text-white"
                      : "bg-odoo-bg text-odoo-text-muted"
                  }`}
                >
                  {STATUS_LABEL[st]}
                </button>
              ))}
            </div>
          )}
          <div className="max-w-3xl" key={shipment?.id ?? "new"}>
            <FormSection title="Лид">
              <label className="col-span-2">
                <span className={labelCls}>Компания</span>
                <select className={inputCls} defaultValue={shipment?.lead_id ?? ""}>
                  <option value="">Выберите лид</option>
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </FormSection>
            <FormSection title="Маршрут">
              <label>
                <span className={labelCls}>Город погрузки</span>
                <input className={inputCls} defaultValue={shipment?.city_loading ?? ""} />
              </label>
              <label>
                <span className={labelCls}>Город выгрузки</span>
                <input className={inputCls} defaultValue={shipment?.city_unloading ?? ""} />
              </label>
              <label>
                <span className={labelCls}>Адрес погрузки</span>
                <input className={inputCls} defaultValue={shipment?.address_loading ?? ""} />
              </label>
              <label>
                <span className={labelCls}>Адрес выгрузки</span>
                <input className={inputCls} defaultValue={shipment?.address_unloading ?? ""} />
              </label>
            </FormSection>
            <FormSection title="Контакты на погрузке">
              <label>
                <span className={labelCls}>Контактное лицо</span>
                <input className={inputCls} defaultValue={shipment?.contact_loading_name ?? ""} />
              </label>
              <label>
                <span className={labelCls}>Телефон</span>
                <input className={inputCls} defaultValue={shipment?.contact_loading_phone ?? ""} />
              </label>
            </FormSection>
            <FormSection title="Контакты на выгрузке">
              <label>
                <span className={labelCls}>Контактное лицо</span>
                <input className={inputCls} defaultValue={shipment?.contact_unloading_name ?? ""} />
              </label>
              <label>
                <span className={labelCls}>Телефон</span>
                <input className={inputCls} defaultValue={shipment?.contact_unloading_phone ?? ""} />
              </label>
            </FormSection>
            <FormSection title="Перевозчик и груз">
              <label>
                <span className={labelCls}>Перевозчик</span>
                <input className={`${inputCls} mb-1`} placeholder="Поиск..." />
                <select className={inputCls} defaultValue={shipment?.carrier_id ?? ""}>
                  <option value="">—</option>
                  {carriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className={labelCls}>Тип транспорта</span>
                <select className={inputCls} defaultValue={shipment?.transport_type ?? "tent"}>
                  <option value="ft_20">Фура 20т</option>
                  <option value="ft_40">Фура 40т</option>
                  <option value="ref">Рефрижератор</option>
                  <option value="tent">Тент</option>
                  <option value="gazel">Газель</option>
                  <option value="other">Другое</option>
                </select>
              </label>
              <label>
                <span className={labelCls}>Вес</span>
                <input className={inputCls} defaultValue={shipment?.cargo_weight ?? ""} />
              </label>
              <label>
                <span className={labelCls}>Объём</span>
                <input className={inputCls} defaultValue={shipment?.cargo_volume ?? ""} />
              </label>
              <label className="col-span-1 md:col-span-2">
                <span className={labelCls}>Комментарий</span>
                <textarea
                  className={inputCls}
                  rows={3}
                  defaultValue={shipment?.comment ?? ""}
                />
              </label>
            </FormSection>
          </div>
        </div>
        {!isNew && (
          <div className="w-full lg:w-[360px]">
            <Chatter timeline={[]} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
