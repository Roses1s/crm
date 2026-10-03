import { FileText } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { ApiError } from "@/shared/api/client";
import {
  useAddShipmentNote,
  useDeleteShipmentAttachment,
  useDeleteShipmentTimelineEntry,
  useEditShipmentNote,
  useLeads,
  useMe,
  useSaveShipment,
  useSetShipmentStatus,
  useShipment,
  useShipmentAttachments,
  useShipmentTimeline,
  useTags,
  useUploadShipmentAttachment,
  type ShipmentPayload,
} from "@/shared/api/hooks";
import { TagsField } from "@/features/crm/lead-form/TagsField";
import type { Attachment } from "@/shared/types";
import { Chatter } from "@/shared/ui/chatter";
import { FilePreview } from "@/shared/ui/file-preview";
import {
  Field,
  FormAlert,
  FormGroup,
  FormSheet,
  FormSheetBg,
  FormStatusIndicator,
  FormStatusbar,
  FormTitle,
  FormWorkspace,
  InnerGroup,
  Notebook,
  OdooCheckbox,
  OdooInput,
} from "@/shared/ui/odoo-form";
import { FormSkeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast-context";
import { TokenField } from "./TokenField";

// Наша компания — статичная шапка бланка.
const OWN_COMPANY = 'ООО "Детроид"';

// Поле без значения — почти невидимое (рамка появляется только при наведении
// или фокусе), чтобы не рисовать пустые «коробки» там, где нечего показывать.
// Как только в поле есть значение, оно получает мягкую подсветку фоном —
// видно с первого взгляда, что заполнено, без слова «не указано» или тире.
const fieldBaseCls =
  "w-full rounded-[3px] border border-transparent px-1.5 py-[3px] text-[13px] leading-[19px] text-odoo-text outline-none transition-colors placeholder:text-odoo-text-light focus:border-odoo-focus/60";
const fieldEmptyCls = "bg-transparent hover:border-odoo-border/50";
const fieldFilledCls = "bg-odoo-primary-soft/50 hover:bg-odoo-primary-soft/70";

function fieldStateCls(filled: boolean) {
  return `${fieldBaseCls} ${filled ? fieldFilledCls : fieldEmptyCls}`;
}

function SInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const filled = Boolean(props.value);
  return <input {...props} className={`${fieldStateCls(filled)} ${className}`} />;
}

function STextarea({ className = "", ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const filled = Boolean(props.value);
  return <textarea {...props} className={`${fieldStateCls(filled)} resize-y ${className}`} />;
}

// Этапы заявки — единая воронка (Новая → … → Машина выгрузилась). Статусбар
// работает по числовым id, поэтому держим и id (позиция), и значение статуса.
const STAGES = [
  { id: 0, value: "new", name: "Новая" },
  { id: 1, value: "checked", name: "Проверена и подписана заявка" },
  { id: 2, value: "loaded", name: "Машина загрузилась" },
  { id: 3, value: "unloaded", name: "Машина выгрузилась" },
] as const;

const TRANSPORT_OPTIONS: { value: string; label: string }[] = [
  { value: "ft_20", label: "Фура 20т" },
  { value: "ft_40", label: "Фура 40т" },
  { value: "ref", label: "Рефрижератор" },
  { value: "tent", label: "Тент" },
  { value: "gazel", label: "Газель" },
  { value: "other", label: "Другое" },
];

// Позиция заказа: одна фиксированная услуга, цена заказчика и перевозчика —
// каждая со своей ставкой НДС.
const SERVICE_NAME = "Транспортно-экспедиционное обслуживание";

const TAX_OPTIONS: { value: string; label: string }[] = [
  { value: "vat_22", label: "НДС 22%" },
  { value: "no_vat", label: "Без НДС" },
  { value: "vat_0", label: "НДС 0%" },
];

function taxRatePercent(tax: string): number {
  return tax === "vat_22" ? 22 : 0;
}

/** Сумма без НДС: price / (1 + ставка/100). */
function netAmount(price: string, tax: string): number | null {
  const value = Number(price);
  if (!price || Number.isNaN(value)) return null;
  return value / (1 + taxRatePercent(tax) / 100);
}

function formatMoney(value: number): string {
  return value.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** ISO-строка с сервера -> локальное время для <input type="datetime-local">
 * (без секунд и часового пояса — ровно то, что понимает сам input). */
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Обратное преобразование для отправки на сервер: datetime-local без пояса
 * браузер и спецификация ECMAScript трактуют как локальное время — то же
 * самое, что ввёл человек в поле, без сюрпризов со сдвигом даты. */
function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

// Маржа показывается не «как есть», а за вычетом фиксированной доли —
// так попросил владелец бизнеса.
const MARGIN_DEDUCTION_RATE = 0.25;

/** Вкладка «Позиции заказа»: одна фиксированная строка услуги с ценой
 * заказчика и перевозчика, у каждой свой НДС, плюс итоговая маржа. */
function OrderLinesTab({
  customerPrice,
  customerTax,
  carrierPrice,
  carrierTax,
  onCustomerPriceChange,
  onCustomerTaxChange,
  onCarrierPriceChange,
  onCarrierTaxChange,
}: {
  customerPrice: string;
  customerTax: string;
  carrierPrice: string;
  carrierTax: string;
  onCustomerPriceChange: (value: string) => void;
  onCustomerTaxChange: (value: string) => void;
  onCarrierPriceChange: (value: string) => void;
  onCarrierTaxChange: (value: string) => void;
}) {
  const customerNet = netAmount(customerPrice, customerTax);
  const carrierNet = netAmount(carrierPrice, carrierTax);
  // Из получившейся разницы дополнительно вычитаем 25% — по требованию
  // владельца бизнеса (доп. расходы/комиссия, не связанные с НДС).
  const margin =
    customerNet != null && carrierNet != null
      ? (customerNet - carrierNet) * (1 - MARGIN_DEDUCTION_RATE)
      : null;

  const th = "whitespace-nowrap px-3 py-2 text-left font-semibold";
  const td = "px-3 py-2 align-middle";

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead className="bg-odoo-surface-sunken text-odoo-text-muted">
            <tr className="border-b border-odoo-border">
              <th rowSpan={2} className={th}>
                Продукт
              </th>
              <th colSpan={3} className={`${th} border-l border-odoo-border text-center`}>
                Цена Заказчик
              </th>
              <th colSpan={3} className={`${th} border-l border-odoo-border text-center`}>
                Цена Перевозчик
              </th>
            </tr>
            <tr className="border-b border-odoo-border">
              <th className={`${th} border-l border-odoo-border`}>Цена</th>
              <th className={th}>Налог</th>
              <th className={th}>Налог исключен.</th>
              <th className={`${th} border-l border-odoo-border`}>Цена</th>
              <th className={th}>Налог</th>
              <th className={th}>Налог исключен.</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-odoo-border-light bg-odoo-surface">
              <td className={td}>{SERVICE_NAME}</td>
              <td className={`${td} border-l border-odoo-border`}>
                <SInput
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={customerPrice}
                  onChange={(e) => onCustomerPriceChange(e.target.value)}
                />
              </td>
              <td className={td}>
                <select
                  className={fieldStateCls(true)}
                  value={customerTax}
                  onChange={(e) => onCustomerTaxChange(e.target.value)}
                >
                  {TAX_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className={`${td} text-odoo-text-muted`}>
                {customerNet != null ? formatMoney(customerNet) : ""}
              </td>
              <td className={`${td} border-l border-odoo-border`}>
                <SInput
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={carrierPrice}
                  onChange={(e) => onCarrierPriceChange(e.target.value)}
                />
              </td>
              <td className={td}>
                <select
                  className={fieldStateCls(true)}
                  value={carrierTax}
                  onChange={(e) => onCarrierTaxChange(e.target.value)}
                >
                  {TAX_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </td>
              <td className={`${td} text-odoo-text-muted`}>
                {carrierNet != null ? formatMoney(carrierNet) : ""}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex justify-end">
        <div className="flex items-center gap-3 px-3 py-2 text-[13px]">
          <span className="font-medium text-odoo-text-muted">Маржа</span>
          <span className="font-semibold text-odoo-text">
            {margin != null ? formatMoney(margin) : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

const emptyForm = {
  number: "",
  lead_id: 0,
  // Дата создания — по умолчанию «сейчас» (проставляется эффектом при
  // открытии формы новой заявки, см. ниже), но её можно поправить задним
  // числом прямо при заведении (см. toDatetimeLocal/fromDatetimeLocal).
  created_at: "",
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

  // Позиция заказа.
  customer_price: "",
  customer_tax: "vat_22",
  carrier_price: "",
  carrier_tax: "vat_22",

  // Заказчик (шапка).
  customer_contact: "",

  // Погрузка.
  loading_cities: [] as string[],
  loading_date_from: "",
  loading_date_to: "",
  loading_time_from: "",

  // Выгрузка.
  unloading_cities: [] as string[],
  unloading_date_from: "",
  unloading_date_to: "",
  unloading_time_from: "",

  // Перевозчик — свободный текст прямо в заявке, без справочника.
  carrier_name: "",
  carrier_inn: "",
  carrier_contact: "",
  vehicle: "",
  vehicle_number: "",
  has_trailer: false,
  trailer_number: "",
  driver_name: "",
  driver_phone: "",
  driver_passport: "",
  carrier_signer: "",

  // Груз.
  cargo_type: "",
  cargo_packaging: "",
  capacity: "",
  body_type: [] as string[],
  loading_method: [] as string[],

  tag_ids: [] as number[],
};

type FormState = typeof emptyForm;

export function ShipmentFormPage() {
  const { id } = useParams();
  // key по id: переход между заявками пересоздаёт форму.
  return <ShipmentForm key={id ?? "new"} id={id} />;
}

function ShipmentForm({ id }: { id?: string }) {
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();

  const { data: currentUser } = useMe();
  const { data: shipment, isLoading } = useShipment(id);
  const { data: leadsPage } = useLeads();
  const leads = leadsPage?.items ?? [];
  const { data: allTags = [] } = useTags();
  const { data: timeline = [] } = useShipmentTimeline(id);
  const { data: attachments = [] } = useShipmentAttachments(shipment?.id);

  const save = useSaveShipment(id);
  const setStatus = useSetShipmentStatus(id);
  const addNote = useAddShipmentNote(id);
  const editNote = useEditShipmentNote(id);
  const deleteEntry = useDeleteShipmentTimelineEntry(id);
  const uploadAttachment = useUploadShipmentAttachment(shipment?.id);
  const deleteAttachment = useDeleteShipmentAttachment(shipment?.id);

  // Лениво: emptyForm — общий модуль, "сейчас" должно считаться в момент
  // открытия именно этой формы, а не один раз при загрузке приложения.
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    created_at: toDatetimeLocal(new Date().toISOString()),
  }));
  const [pristine, setPristine] = useState<FormState>(form);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [tab, setTab] = useState("lines");
  const loadedId = useRef<number | null>(null);

  // Заявка из карточки лида приходит со ссылкой /shipments/new?lead=42.
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (isNew && leadParam) setForm((f) => ({ ...f, lead_id: Number(leadParam) }));
  }, [isNew, searchParams]);

  // Загруженную карточку кладём в форму один раз, чтобы фоновое обновление
  // не затирало несохранённые правки.
  useEffect(() => {
    if (shipment && loadedId.current !== shipment.id) {
      loadedId.current = shipment.id;
      const next: FormState = {
        number: shipment.number ?? "",
        created_at: toDatetimeLocal(shipment.created_at),
        lead_id: shipment.lead_id,
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

        customer_price: shipment.customer_price ?? "",
        customer_tax: shipment.customer_tax ?? "vat_22",
        carrier_price: shipment.carrier_price ?? "",
        carrier_tax: shipment.carrier_tax ?? "vat_22",

        customer_contact: shipment.customer_contact ?? "",

        loading_cities: shipment.loading_cities ?? [],
        loading_date_from: shipment.loading_date_from ?? "",
        loading_date_to: shipment.loading_date_to ?? "",
        loading_time_from: shipment.loading_time_from ?? "",

        unloading_cities: shipment.unloading_cities ?? [],
        unloading_date_from: shipment.unloading_date_from ?? "",
        unloading_date_to: shipment.unloading_date_to ?? "",
        unloading_time_from: shipment.unloading_time_from ?? "",

        carrier_name: shipment.carrier_name ?? "",
        carrier_inn: shipment.carrier_inn ?? "",
        carrier_contact: shipment.carrier_contact ?? "",
        vehicle: shipment.vehicle ?? "",
        vehicle_number: shipment.vehicle_number ?? "",
        has_trailer: shipment.has_trailer ?? false,
        trailer_number: shipment.trailer_number ?? "",
        driver_name: shipment.driver_name ?? "",
        driver_phone: shipment.driver_phone ?? "",
        driver_passport: shipment.driver_passport ?? "",
        carrier_signer: shipment.carrier_signer ?? "",

        cargo_type: shipment.cargo_type ?? "",
        cargo_packaging: shipment.cargo_packaging ?? "",
        capacity: shipment.capacity ?? "",
        body_type: shipment.body_type ?? [],
        loading_method: shipment.loading_method ?? [],

        tag_ids: shipment.tags?.map((t) => t.id) ?? [],
      };
      setForm(next);
      setPristine(next);
    }
  }, [shipment]);

  const dirty = isNew ? form.lead_id !== 0 : JSON.stringify(form) !== JSON.stringify(pristine);
  const saving = save.isPending;
  // Автосохранение выключается после неудачной попытки и включается снова,
  // когда человек что-то поправил. Без этого неудачный запрос повторялся
  // каждые 3 секунды, пока открыта вкладка.
  const autoSaveBlocked = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    // Правка руками снимает запрет автосохранения: прошлая попытка могла
    // упасть именно из-за того, что сейчас исправляют.
    autoSaveBlocked.current = false;
    setForm((f) => ({ ...f, [key]: value }));
  }

  function describe(err: unknown, fallback: string): string {
    if (err instanceof ApiError) return err.message;
    return fallback;
  }

  function submit(options: { manual?: boolean } = {}) {
    if (options.manual) autoSaveBlocked.current = false;
    setError("");
    if (!form.lead_id) {
      setError("Выберите лид, по которому создаётся заявка");
      return;
    }
    // У новой заявки номер ещё не присвоен (поле пустое до создания — сервер
    // сам подставит id). У уже существующей — это единственный видимый
    // идентификатор, стирать его в пустоту нельзя (не на чем будет
    // восстановиться само собой).
    if (!isNew && !form.number.trim()) {
      setError("Номер заявки не может быть пустым");
      return;
    }
    const payload: ShipmentPayload = {
      ...form,
      number: form.number.trim(),
      // Поле всегда заполнено (по умолчанию — «сейчас»), но на случай, если
      // человек всё-таки очистил его руками, не шлём пустую строку: сервер
      // не примет null/"" в NOT NULL колонку — просто не меняем дату.
      created_at: form.created_at ? fromDatetimeLocal(form.created_at) : undefined,
      cargo_weight: form.cargo_weight || null,
      cargo_volume: form.cargo_volume || null,
      capacity: form.capacity || null,
      customer_price: form.customer_price || null,
      carrier_price: form.carrier_price || null,
      loading_date_from: form.loading_date_from || null,
      loading_date_to: form.loading_date_to || null,
      unloading_date_from: form.unloading_date_from || null,
      unloading_date_to: form.unloading_date_to || null,
    };
    save.mutate(payload, {
      onSuccess: (saved) => {
        if (isNew) {
          navigate(`/shipments/${saved.id}`, { replace: true });
        } else {
          setPristine(form);
          toast.show("Сохранено");
        }
      },
      onError: (err) => {
        autoSaveBlocked.current = true;
        setError(describe(err, "Не удалось сохранить заявку"));
      },
    });
  }

  function discard() {
    setError("");
    if (isNew) {
      navigate("/shipments");
      return;
    }
    setForm(pristine);
  }

  // Автосохранение: через 3с без правок сохраняем сами, кнопка в хедере
  // остаётся — для спокойствия и чтобы сохранить можно было сразу, не ждя.
  // Новую (ещё не созданную) заявку не трогаем — её создаёт только сам
  // пользователь явным сохранением.
  useEffect(() => {
    if (isNew || !dirty || saving || autoSaveBlocked.current) return;
    const timer = setTimeout(() => submit(), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, dirty, saving, form]);

  // Смена этапа у сохранённой заявки уходит на сервер сразу — как в Odoo.
  function selectStage(stageIndex: number) {
    const stage = STAGES[stageIndex];
    if (!stage || isNew) return;
    if (shipment && stage.value === shipment.status) return;
    setStatus.mutate(stage.value, {
      onError: (err) => setError(describe(err, "Не удалось изменить этап")),
    });
  }

  const currentStageId = STAGES.find((s) => s.value === shipment?.status)?.id ?? 0;

  const selectedLead = leads.find((l) => l.id === form.lead_id);
  const title = shipment?.lead_name || selectedLead?.name || "Новая заявка";

  const composerInitial = (currentUser?.first_name || currentUser?.email || "Я")
    .slice(0, 1)
    .toUpperCase();

  const chatter = !isNew ? (
    <Chatter
      timeline={timeline}
      authorInitials={composerInitial}
      attachments={attachments}
      posting={addNote.isPending || uploadAttachment.isPending}
      uploading={uploadAttachment.isPending}
      onSubmit={(body, files) => {
        if (!body && files.length === 0) return;
        addNote.mutate(body || "Вложение", {
          onSuccess: (entry) => {
            for (const file of files) {
              uploadAttachment.mutate({ file, entryId: Number(entry.id) });
            }
          },
        });
      }}
      onUpload={(file) => uploadAttachment.mutate({ file })}
      onDelete={(file) => deleteAttachment.mutate(file.id)}
      onPreview={(file) => setPreview(file)}
      onEditNote={(entryId, body) => editNote.mutate({ entryId, body })}
      onDeleteEntry={(entry) => deleteEntry.mutate(Number(entry.id))}
    />
  ) : undefined;

  return (
    <AppShell>
      <ControlPanel
        crumbs={[{ label: "Заявки", to: "/shipments" }, { label: isNew ? "Новая заявка" : title }]}
        status={
          <FormStatusIndicator
            dirty={dirty}
            saving={saving}
            onSave={() => submit({ manual: true })}
            onDiscard={discard}
          />
        }
        stats={
          !isNew && selectedLead ? (
            <Link
              to={`/crm/leads/${selectedLead.id}`}
              className="inline-flex h-[34px] items-center gap-2 rounded-[4px] border border-odoo-border bg-odoo-surface px-2.5 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg"
            >
              <FileText className="h-4 w-4 text-odoo-text-muted" />
              Открыть лид
            </Link>
          ) : null
        }
      />

      <FormWorkspace aside={chatter}>
        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          <FormStatusbar
            items={STAGES.map((s) => ({ id: s.id, name: s.name }))}
            current={currentStageId}
            disabled={setStatus.isPending || isNew}
            onSelect={selectStage}
          />

          <FormSheetBg>
            {error && <FormAlert>{error}</FormAlert>}

            <FormSheet>
              {isLoading && !isNew ? (
                <FormSkeleton />
              ) : (
                <>
                  <FormTitle>
                    <OdooInput
                      aria-label="Номер заявки"
                      placeholder={isNew ? "Введётся автоматически" : "Номер заявки"}
                      className="!px-0 !text-[24px] !leading-[34px]"
                      value={form.number}
                      onChange={(e) => set("number", e.target.value)}
                    />
                  </FormTitle>

                  {/* --- Шапка: своя компания и заказчик (заказчик привязан к лиду) --- */}
                  <FormGroup>
                    <div>
                      <InnerGroup title="Заявка">
                        <Field label="Компания">
                          <span className="px-1.5 py-[3px] text-odoo-text">{OWN_COMPANY}</span>
                        </Field>
                        <Field label="Дата создания" htmlFor="ship-created-at">
                          <SInput
                            id="ship-created-at"
                            type="datetime-local"
                            value={form.created_at}
                            onChange={(e) => set("created_at", e.target.value)}
                          />
                        </Field>
                        <Field label="Заказчик">
                          <span className="px-1.5 py-[3px] text-odoo-text">
                            {selectedLead?.name || title}
                          </span>
                        </Field>
                        <Field label="ИНН заказчика">
                          <span className="px-1.5 py-[3px] text-odoo-text-muted">
                            {selectedLead?.inn}
                          </span>
                        </Field>
                        <Field label="Контакт заказчика" htmlFor="ship-cust-contact">
                          <SInput
                            id="ship-cust-contact"
                            value={form.customer_contact}
                            onChange={(e) => set("customer_contact", e.target.value)}
                          />
                        </Field>
                      </InnerGroup>
                    </div>
                    <div>
                      <InnerGroup>
                        <Field label="Теги" help="Рабочие пометки заявки — видны в списке заявок">
                          <TagsField
                            all={allTags}
                            value={form.tag_ids}
                            onChange={(ids) => set("tag_ids", ids)}
                          />
                        </Field>
                      </InnerGroup>
                    </div>
                  </FormGroup>

                  {/* --- Погрузка / Выгрузка --- */}
                  <FormGroup>
                    <div>
                      <InnerGroup title="Информация о погрузке">
                        <Field label="Города погрузки" htmlFor="ship-load-cities">
                          <TokenField
                            id="ship-load-cities"
                            placeholder="Город + Enter"
                            value={form.loading_cities}
                            onChange={(v) => set("loading_cities", v)}
                          />
                        </Field>
                        <Field label="Адрес погрузки" htmlFor="ship-addr-load">
                          <SInput
                            id="ship-addr-load"
                            value={form.address_loading}
                            onChange={(e) => set("address_loading", e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Контактное лицо на погрузке и телефон"
                          htmlFor="ship-load-name"
                        >
                          <SInput
                            id="ship-load-name"
                            placeholder="Иванов Иван, +7 900 000-00-00"
                            value={form.contact_loading_name}
                            onChange={(e) => set("contact_loading_name", e.target.value)}
                          />
                        </Field>
                        <Field label="Дата погрузки с" htmlFor="ship-load-date-from">
                          <SInput
                            id="ship-load-date-from"
                            type="date"
                            value={form.loading_date_from}
                            onChange={(e) => set("loading_date_from", e.target.value)}
                          />
                        </Field>
                        <Field label="Дата погрузки по" htmlFor="ship-load-date-to">
                          <SInput
                            id="ship-load-date-to"
                            type="date"
                            value={form.loading_date_to}
                            onChange={(e) => set("loading_date_to", e.target.value)}
                          />
                        </Field>
                        <Field label="Время" htmlFor="ship-load-time-from">
                          <SInput
                            id="ship-load-time-from"
                            placeholder="09:00"
                            value={form.loading_time_from}
                            onChange={(e) => set("loading_time_from", e.target.value)}
                          />
                        </Field>
                      </InnerGroup>
                    </div>

                    <div>
                      <InnerGroup title="Информация о выгрузке">
                        <Field label="Города выгрузки" htmlFor="ship-unload-cities">
                          <TokenField
                            id="ship-unload-cities"
                            placeholder="Город + Enter"
                            value={form.unloading_cities}
                            onChange={(v) => set("unloading_cities", v)}
                          />
                        </Field>
                        <Field label="Адрес выгрузки" htmlFor="ship-addr-unload">
                          <SInput
                            id="ship-addr-unload"
                            value={form.address_unloading}
                            onChange={(e) => set("address_unloading", e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Контактное лицо на выгрузке и телефон"
                          htmlFor="ship-unload-name"
                        >
                          <SInput
                            id="ship-unload-name"
                            placeholder="Иванов Иван, +7 900 000-00-00"
                            value={form.contact_unloading_name}
                            onChange={(e) => set("contact_unloading_name", e.target.value)}
                          />
                        </Field>
                        <Field label="Дата выгрузки с" htmlFor="ship-unload-date-from">
                          <SInput
                            id="ship-unload-date-from"
                            type="date"
                            value={form.unloading_date_from}
                            onChange={(e) => set("unloading_date_from", e.target.value)}
                          />
                        </Field>
                        <Field label="Дата выгрузки по" htmlFor="ship-unload-date-to">
                          <SInput
                            id="ship-unload-date-to"
                            type="date"
                            value={form.unloading_date_to}
                            onChange={(e) => set("unloading_date_to", e.target.value)}
                          />
                        </Field>
                        <Field label="Время" htmlFor="ship-unload-time-from">
                          <SInput
                            id="ship-unload-time-from"
                            placeholder="09:00"
                            value={form.unloading_time_from}
                            onChange={(e) => set("unloading_time_from", e.target.value)}
                          />
                        </Field>
                      </InnerGroup>
                    </div>
                  </FormGroup>

                  {/* --- Перевозчик / Груз --- */}
                  <FormGroup>
                    <div>
                      <InnerGroup title="Сведения о перевозчике">
                        <Field label="Перевозчик" htmlFor="ship-carrier-name">
                          {/* Перевозчика просто вписывают текстом — любого,
                          без выбора из справочника (справочника больше нет). */}
                          <SInput
                            id="ship-carrier-name"
                            placeholder="Название компании"
                            value={form.carrier_name}
                            onChange={(e) => set("carrier_name", e.target.value)}
                          />
                        </Field>
                        <Field label="ИНН перевозчика" htmlFor="ship-carrier-inn">
                          <SInput
                            id="ship-carrier-inn"
                            inputMode="numeric"
                            placeholder="10 или 12 цифр"
                            value={form.carrier_inn}
                            onChange={(e) => set("carrier_inn", e.target.value)}
                          />
                        </Field>
                        <Field label="Контакт перевозчика" htmlFor="ship-carr-contact">
                          <SInput
                            id="ship-carr-contact"
                            value={form.carrier_contact}
                            onChange={(e) => set("carrier_contact", e.target.value)}
                          />
                        </Field>
                        <Field label="ТС (марка)" htmlFor="ship-vehicle">
                          <SInput
                            id="ship-vehicle"
                            value={form.vehicle}
                            onChange={(e) => set("vehicle", e.target.value)}
                          />
                        </Field>
                        <Field label="Номер ТС" htmlFor="ship-vehicle-num">
                          <SInput
                            id="ship-vehicle-num"
                            value={form.vehicle_number}
                            onChange={(e) => set("vehicle_number", e.target.value)}
                          />
                        </Field>
                        <Field label="Прицеп" htmlFor="ship-has-trailer">
                          <OdooCheckbox
                            id="ship-has-trailer"
                            label="Есть прицеп"
                            checked={form.has_trailer}
                            onChange={(v) => set("has_trailer", v)}
                          />
                        </Field>
                        {form.has_trailer && (
                          <Field label="Номер прицепа" htmlFor="ship-trailer-num">
                            <SInput
                              id="ship-trailer-num"
                              value={form.trailer_number}
                              onChange={(e) => set("trailer_number", e.target.value)}
                            />
                          </Field>
                        )}
                        <Field label="ФИО водителя" htmlFor="ship-driver-name">
                          <SInput
                            id="ship-driver-name"
                            value={form.driver_name}
                            onChange={(e) => set("driver_name", e.target.value)}
                          />
                        </Field>
                        <Field label="Телефон водителя" htmlFor="ship-driver-phone">
                          <SInput
                            id="ship-driver-phone"
                            placeholder="+7 900 000-00-00"
                            value={form.driver_phone}
                            onChange={(e) => set("driver_phone", e.target.value)}
                          />
                        </Field>
                        <Field label="Паспорт водителя" htmlFor="ship-driver-pass">
                          <SInput
                            id="ship-driver-pass"
                            value={form.driver_passport}
                            onChange={(e) => set("driver_passport", e.target.value)}
                          />
                        </Field>
                        <Field label="Кто подписывает" htmlFor="ship-carr-signer">
                          <SInput
                            id="ship-carr-signer"
                            value={form.carrier_signer}
                            onChange={(e) => set("carrier_signer", e.target.value)}
                          />
                        </Field>
                      </InnerGroup>
                    </div>

                    <div>
                      <InnerGroup title="Информация о грузе">
                        <Field label="Тип груза" htmlFor="ship-cargo-type">
                          <SInput
                            id="ship-cargo-type"
                            value={form.cargo_type}
                            onChange={(e) => set("cargo_type", e.target.value)}
                          />
                        </Field>
                        <Field label="Упаковка" htmlFor="ship-cargo-pack">
                          <SInput
                            id="ship-cargo-pack"
                            value={form.cargo_packaging}
                            onChange={(e) => set("cargo_packaging", e.target.value)}
                          />
                        </Field>
                        <Field label="Объём кузова, м³" htmlFor="ship-volume">
                          <SInput
                            id="ship-volume"
                            inputMode="decimal"
                            value={form.cargo_volume}
                            onChange={(e) => set("cargo_volume", e.target.value)}
                          />
                        </Field>
                        <Field label="Вес груза, т" htmlFor="ship-weight">
                          <SInput
                            id="ship-weight"
                            inputMode="decimal"
                            value={form.cargo_weight}
                            onChange={(e) => set("cargo_weight", e.target.value)}
                          />
                        </Field>
                        <Field label="Грузоподъёмность, т" htmlFor="ship-capacity">
                          <SInput
                            id="ship-capacity"
                            inputMode="decimal"
                            value={form.capacity}
                            onChange={(e) => set("capacity", e.target.value)}
                          />
                        </Field>
                        <Field label="Тип кузова" htmlFor="ship-body-type">
                          <TokenField
                            id="ship-body-type"
                            placeholder="Например: изотерм + Enter"
                            value={form.body_type}
                            onChange={(v) => set("body_type", v)}
                          />
                        </Field>
                        <Field label="Способ погрузки" htmlFor="ship-load-method">
                          <TokenField
                            id="ship-load-method"
                            placeholder="Например: задняя + Enter"
                            value={form.loading_method}
                            onChange={(v) => set("loading_method", v)}
                          />
                        </Field>
                        <Field label="Тип транспорта" htmlFor="ship-transport">
                          <select
                            id="ship-transport"
                            className={fieldStateCls(Boolean(form.transport_type))}
                            value={form.transport_type}
                            onChange={(e) => set("transport_type", e.target.value)}
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
                  </FormGroup>

                  {/* --- Вкладки: позиции заказа / прочая информация --- */}
                  <Notebook
                    active={tab}
                    onSelect={setTab}
                    tabs={[
                      {
                        id: "lines",
                        label: "Позиции заказа",
                        content: (
                          <OrderLinesTab
                            customerPrice={form.customer_price}
                            customerTax={form.customer_tax}
                            carrierPrice={form.carrier_price}
                            carrierTax={form.carrier_tax}
                            onCustomerPriceChange={(v) => set("customer_price", v)}
                            onCustomerTaxChange={(v) => set("customer_tax", v)}
                            onCarrierPriceChange={(v) => set("carrier_price", v)}
                            onCarrierTaxChange={(v) => set("carrier_tax", v)}
                          />
                        ),
                      },
                      {
                        id: "info",
                        label: "Прочая информация",
                        content: (
                          <STextarea
                            id="ship-comment"
                            rows={4}
                            placeholder="Дополнительные условия, комментарии…"
                            value={form.comment}
                            onChange={(e) => set("comment", e.target.value)}
                          />
                        ),
                      },
                    ]}
                  />
                </>
              )}
            </FormSheet>
          </FormSheetBg>
        </main>
      </FormWorkspace>

      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </AppShell>
  );
}
