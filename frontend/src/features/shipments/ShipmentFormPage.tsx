import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell, Breadcrumb, Toolbar } from "@/app/layout/AppShell";
import { carriers } from "@/shared/mock/carriers";
import { leads } from "@/shared/mock/leads";
import { shipmentById } from "@/shared/mock/shipments";
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
 * Карточка заявки. Поля редактируемые, но ничего не сохраняют:
 * сохранение, смена статуса и подстановка данных лида убраны.
 */
export function ShipmentFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const shipment = isNew ? null : shipmentById(id);
  const selectedLead = shipment ? leads.find((l) => l.id === shipment.lead) : undefined;

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
                <select className={inputCls} defaultValue={shipment?.lead ?? ""}>
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
                <input className={inputCls} defaultValue={isNew ? "" : "ул. Промышленная, 14"} />
              </label>
              <label>
                <span className={labelCls}>Адрес выгрузки</span>
                <input className={inputCls} defaultValue={isNew ? "" : "пр. Заводской, 5, склад 3"} />
              </label>
            </FormSection>
            <FormSection title="Контакты на погрузке">
              <label>
                <span className={labelCls}>Контактное лицо</span>
                <input className={inputCls} defaultValue={isNew ? "" : "Громов Сергей"} />
              </label>
              <label>
                <span className={labelCls}>Телефон</span>
                <input className={inputCls} defaultValue={isNew ? "" : "+7 912 300-14-20"} />
              </label>
            </FormSection>
            <FormSection title="Контакты на выгрузке">
              <label>
                <span className={labelCls}>Контактное лицо</span>
                <input className={inputCls} defaultValue={isNew ? "" : "Литвинова Ольга"} />
              </label>
              <label>
                <span className={labelCls}>Телефон</span>
                <input className={inputCls} defaultValue={isNew ? "" : "+7 913 555-01-14"} />
              </label>
            </FormSection>
            <FormSection title="Перевозчик и груз">
              <label>
                <span className={labelCls}>Перевозчик</span>
                <input className={`${inputCls} mb-1`} placeholder="Поиск..." />
                <select className={inputCls} defaultValue={shipment?.carrier ?? ""}>
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
                <select className={inputCls} defaultValue="tent">
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
                <input className={inputCls} defaultValue={isNew ? "" : "18.5"} />
              </label>
              <label>
                <span className={labelCls}>Объём</span>
                <input className={inputCls} defaultValue={isNew ? "" : "62"} />
              </label>
              <label className="col-span-1 md:col-span-2">
                <span className={labelCls}>Комментарий</span>
                <textarea
                  className={inputCls}
                  rows={3}
                  defaultValue={isNew ? "" : "Выгрузка строго до 16:00, пропуск заказать заранее."}
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
