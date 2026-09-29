import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import { AppShell, Breadcrumb, Toolbar } from "@/app/layout/AppShell";
import { ApiError } from "@/shared/api/client";
import {
  useCarriers,
  useLeads,
  useSaveShipment,
  useSetShipmentStatus,
  useShipment,
  type ShipmentPayload,
} from "@/shared/api/hooks";
import { ShipmentAttachments } from "@/features/shipments/ShipmentAttachments";
import { Button } from "@/shared/ui/button";
import { FormSection } from "@/shared/ui/form-section";
import { FormSkeleton } from "@/shared/ui/skeleton";

const STATUSES = [
  "new",
  "in_progress",
  "in_transit",
  "delivered",
  "cancelled",
] as const;
const STATUS_LABEL: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  in_transit: "В пути",
  delivered: "Доставлена",
  cancelled: "Отменена",
};

const inputCls =
  "w-full rounded-[4px] border border-odoo-border px-2.5 py-1.5 text-sm";
const labelCls =
  "mb-1 block text-xs font-medium uppercase text-odoo-text-muted";

const emptyForm = {
  lead_id: 0,
  carrier_id: null as number | null,
  city_loading: "",
  city_unloading: "",
  address_loading: "",
  address_unloading: "",
  contact_loading_name: "",
  contact_loading_phone: "",
  contact_unloading_name: "",
  contact_unloading_phone: "",
  transport_type: "tent",
  cargo_weight: "",
  cargo_volume: "",
  comment: "",
};

type FormState = typeof emptyForm;

export function ShipmentFormPage() {
  const { id } = useParams();
  return <ShipmentForm key={id ?? "new"} id={id} />;
}

function ShipmentForm({ id }: { id?: string }) {
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: shipment, isLoading } = useShipment(id);
  const { data: carriers = [] } = useCarriers();
  const { data: leads = [] } = useLeads();
  const save = useSaveShipment(id);
  const setStatus = useSetShipmentStatus(id);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [carrierQuery, setCarrierQuery] = useState("");
  const [error, setError] = useState("");

  // Заявка из карточки лида приходит со ссылкой /shipments/new?lead=42.
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (isNew && leadParam)
      setForm((f) => ({ ...f, lead_id: Number(leadParam) }));
  }, [isNew, searchParams]);

  useEffect(() => {
    if (!shipment) return;
    setForm({
      lead_id: shipment.lead_id,
      carrier_id: shipment.carrier_id,
      city_loading: shipment.city_loading ?? "",
      city_unloading: shipment.city_unloading ?? "",
      address_loading: shipment.address_loading ?? "",
      address_unloading: shipment.address_unloading ?? "",
      contact_loading_name: shipment.contact_loading_name ?? "",
      contact_loading_phone: shipment.contact_loading_phone ?? "",
      contact_unloading_name: shipment.contact_unloading_name ?? "",
      contact_unloading_phone: shipment.contact_unloading_phone ?? "",
      transport_type: shipment.transport_type ?? "tent",
      cargo_weight: shipment.cargo_weight ?? "",
      cargo_volume: shipment.cargo_volume ?? "",
      comment: shipment.comment ?? "",
    });
  }, [shipment]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit() {
    setError("");
    if (!form.lead_id) {
      setError("Выберите лид, по которому создаётся заявка");
      return;
    }
    const payload: ShipmentPayload = {
      ...form,
      cargo_weight: form.cargo_weight || null,
      cargo_volume: form.cargo_volume || null,
    };
    save.mutate(payload, {
      onSuccess: (saved) =>
        navigate(`/shipments/${saved.id}`, { replace: true }),
      onError: (err) =>
        setError(
          err instanceof ApiError ? err.message : "Не удалось сохранить заявку",
        ),
    });
  }

  const selectedLead = leads.find((l) => l.id === form.lead_id);
  const filteredCarriers = carriers.filter((c) =>
    c.name.toLowerCase().includes(carrierQuery.toLowerCase()),
  );

  return (
    <AppShell>
      <Breadcrumb items={["Заявки", isNew ? "Новая" : `#${id}`]} />
      <Toolbar>
        <Button variant="secondary" onClick={() => navigate("/shipments")}>
          Назад
        </Button>
        {!isNew && selectedLead && (
          <Link
            to={`/crm/leads/${selectedLead.id}`}
            className="text-sm text-odoo-action"
          >
            Лид: {selectedLead.name}
          </Link>
        )}
        <span className="ml-auto" />
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
      </Toolbar>

      {/* Та же защита от разъезжающихся колонок, что и в карточке лида. */}
      <div className="mx-auto flex min-h-[calc(100vh-140px)] w-full max-w-[1900px] flex-col lg:flex-row">
        <div className="flex-1 p-4">
          {!isNew && (
            <div className="mb-4 flex flex-wrap gap-1">
              {STATUSES.map((st) => (
                <button
                  key={st}
                  type="button"
                  disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate(st)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60 ${
                    shipment?.status === st
                      ? "bg-odoo-primary text-white"
                      : "bg-odoo-bg text-odoo-text-muted hover:bg-odoo-surface-sunken"
                  }`}
                >
                  {STATUS_LABEL[st]}
                </button>
              ))}
            </div>
          )}

          {isLoading && !isNew ? (
            <FormSkeleton />
          ) : (
            <div className="max-w-3xl">
              {error && (
                <p className="mb-3 text-sm text-odoo-danger">{error}</p>
              )}

              <FormSection title="Лид">
                <label className="col-span-2">
                  <span className={labelCls}>Компания</span>
                  <select
                    className={inputCls}
                    value={form.lead_id || ""}
                    onChange={(e) => set("lead_id", Number(e.target.value))}
                  >
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
                  <input
                    className={inputCls}
                    value={form.city_loading}
                    onChange={(e) => set("city_loading", e.target.value)}
                  />
                </label>
                <label>
                  <span className={labelCls}>Город выгрузки</span>
                  <input
                    className={inputCls}
                    value={form.city_unloading}
                    onChange={(e) => set("city_unloading", e.target.value)}
                  />
                </label>
                <label>
                  <span className={labelCls}>Адрес погрузки</span>
                  <input
                    className={inputCls}
                    value={form.address_loading}
                    onChange={(e) => set("address_loading", e.target.value)}
                  />
                </label>
                <label>
                  <span className={labelCls}>Адрес выгрузки</span>
                  <input
                    className={inputCls}
                    value={form.address_unloading}
                    onChange={(e) => set("address_unloading", e.target.value)}
                  />
                </label>
              </FormSection>

              <FormSection title="Контакты на погрузке">
                <label>
                  <span className={labelCls}>Контактное лицо</span>
                  <input
                    className={inputCls}
                    value={form.contact_loading_name}
                    onChange={(e) =>
                      set("contact_loading_name", e.target.value)
                    }
                  />
                </label>
                <label>
                  <span className={labelCls}>Телефон</span>
                  <input
                    className={inputCls}
                    value={form.contact_loading_phone}
                    onChange={(e) =>
                      set("contact_loading_phone", e.target.value)
                    }
                  />
                </label>
              </FormSection>

              <FormSection title="Контакты на выгрузке">
                <label>
                  <span className={labelCls}>Контактное лицо</span>
                  <input
                    className={inputCls}
                    value={form.contact_unloading_name}
                    onChange={(e) =>
                      set("contact_unloading_name", e.target.value)
                    }
                  />
                </label>
                <label>
                  <span className={labelCls}>Телефон</span>
                  <input
                    className={inputCls}
                    value={form.contact_unloading_phone}
                    onChange={(e) =>
                      set("contact_unloading_phone", e.target.value)
                    }
                  />
                </label>
              </FormSection>

              <FormSection title="Перевозчик и груз">
                <label>
                  <span className={labelCls}>Перевозчик</span>
                  <input
                    className={`${inputCls} mb-1`}
                    placeholder="Поиск..."
                    value={carrierQuery}
                    onChange={(e) => setCarrierQuery(e.target.value)}
                  />
                  <select
                    className={inputCls}
                    value={form.carrier_id ?? ""}
                    onChange={(e) =>
                      set(
                        "carrier_id",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                  >
                    <option value="">—</option>
                    {filteredCarriers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className={labelCls}>Тип транспорта</span>
                  <select
                    className={inputCls}
                    value={form.transport_type}
                    onChange={(e) => set("transport_type", e.target.value)}
                  >
                    <option value="ft_20">Фура 20т</option>
                    <option value="ft_40">Фура 40т</option>
                    <option value="ref">Рефрижератор</option>
                    <option value="tent">Тент</option>
                    <option value="gazel">Газель</option>
                    <option value="other">Другое</option>
                  </select>
                </label>
                <label>
                  <span className={labelCls}>Вес, т</span>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={form.cargo_weight}
                    onChange={(e) => set("cargo_weight", e.target.value)}
                  />
                </label>
                <label>
                  <span className={labelCls}>Объём, м³</span>
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    value={form.cargo_volume}
                    onChange={(e) => set("cargo_volume", e.target.value)}
                  />
                </label>
                <label className="col-span-1 md:col-span-2">
                  <span className={labelCls}>Комментарий</span>
                  <textarea
                    className={inputCls}
                    rows={3}
                    value={form.comment}
                    onChange={(e) => set("comment", e.target.value)}
                  />
                </label>
              </FormSection>
            </div>
          )}
        </div>

        {!isNew && shipment && (
          <div className="w-full shrink-0 lg:w-[420px]">
            {/* Ленты изменений у заявки нет, поэтому правая колонка — документы. */}
            <ShipmentAttachments shipmentId={shipment.id} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
