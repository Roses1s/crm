import { FileText } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { ApiError } from "@/shared/api/client";
import {
  useAddShipmentNote,
  useDeleteShipmentAttachment,
  useDeleteShipmentTimelineEntry,
  useEditShipmentNote,
  useLead,
  useLeads,
  useMe,
  useMeta,
  useSaveShipment,
  useSetShipmentStatus,
  useShipment,
  useShipmentAttachments,
  useShipmentTimeline,
  useUploadShipmentAttachment,
  type ShipmentPayload,
} from "@/shared/api/hooks";
import type { Attachment } from "@/shared/types";
import { Chatter } from "@/shared/ui/chatter";
import { FilePreview } from "@/shared/ui/file-preview";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";
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
import { fromDatetimeLocal, selectStateCls, toDatetimeLocal } from "./shipment-form/helpers";
import { CargoGroup } from "./shipment-form/CargoGroup";
import { LoadingGroup } from "./shipment-form/LoadingGroup";
import { OrderLinesTab } from "./shipment-form/OrderLinesTab";
import { UnloadingGroup } from "./shipment-form/UnloadingGroup";
import { SInput, STextarea } from "./shipment-form/fields";

// Наша компания — статичная шапка бланка.
const OWN_COMPANY = 'ООО "Детроид"';

// Этапы заявки — единая воронка (Новая → … → Машина выгрузилась). Статусбар
// работает по числовым id, поэтому держим и id (позиция), и значение статуса.
const STAGES = [
  { id: 0, value: "new", name: "Новая" },
  { id: 1, value: "checked", name: "Проверена и подписана заявка" },
  { id: 2, value: "loaded", name: "Машина загрузилась" },
  { id: 3, value: "unloaded", name: "Машина выгрузилась" },
] as const;

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

  // Поле тегов убрано из карточки 03.10.2026, но значения продолжают ездить
  // на сервер и обратно: так уже проставленные теги не стираются сохранением.
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
  // Как и в карточке лида: номер есть в адресе, вложения не ждут ответа по заявке.
  const savedId = isNew ? undefined : id;
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [leadSearch, setLeadSearch] = useState("");

  const { data: currentUser } = useMe();
  // Ставка вычета маржи — с сервера, единственная копия в бэкенде (Т-08).
  const { data: meta } = useMeta();
  const { data: shipment, isLoading } = useShipment(id);
  const { data: leadsPage } = useLeads(isNew ? { search: leadSearch } : {});
  const leads = leadsPage?.items ?? [];
  const { data: timeline = [] } = useShipmentTimeline(id);
  const { data: attachments = [] } = useShipmentAttachments(savedId);

  const save = useSaveShipment(id);
  const setStatus = useSetShipmentStatus(id);
  const addNote = useAddShipmentNote(id);
  const editNote = useEditShipmentNote(id);
  const deleteEntry = useDeleteShipmentTimelineEntry(id);
  const uploadAttachment = useUploadShipmentAttachment(savedId);
  const deleteAttachment = useDeleteShipmentAttachment(savedId);

  // Лениво: emptyForm — общий модуль, "сейчас" должно считаться в момент
  // открытия именно этой формы, а не один раз при загрузке приложения.
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    created_at: toDatetimeLocal(new Date().toISOString()),
  }));
  const [pristine, setPristine] = useState<FormState>(form);
  const { data: selectedLeadDetails } = useLead(
    isNew && form.lead_id ? String(form.lead_id) : undefined,
  );
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [tab, setTab] = useState("lines");
  const loadedId = useRef<number | null>(null);

  // Заявка из карточки лида приходит со ссылкой /shipments/new?lead=42.
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (isNew && leadParam) {
      const leadId = Number(leadParam);
      setForm((f) => ({ ...f, lead_id: leadId }));
      setPristine((p) => ({ ...p, lead_id: leadId }));
    }
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

  const dirty = JSON.stringify(form) !== JSON.stringify(pristine);
  const saving = save.isPending;
  // Автосохранение выключается после неудачной попытки и включается снова,
  // когда человек что-то поправил. Без этого неудачный запрос повторялся
  // каждые 3 секунды, пока открыта вкладка.
  const autoSaveBlocked = useRef(false);
  const bypassNextNavigation = useRef(false);
  const proceedAfterSave = useRef(false);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypassNextNavigation.current) {
      bypassNextNavigation.current = false;
      return false;
    }
    const locationChanges =
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search;
    return (dirty || saving) && locationChanges && nextLocation.pathname !== "/login";
  });
  const blockerRef = useRef(blocker);
  blockerRef.current = blocker;
  const transitionProceeded = useRef(false);

  const continueBlockedNavigation = useCallback(() => {
    const current = blockerRef.current;
    if (current.state !== "blocked" || transitionProceeded.current) return;
    transitionProceeded.current = true;
    current.proceed();
  }, []);

  // Если сохранение завершилось во время перехода, продолжаем только один раз.
  useEffect(() => {
    if (blocker.state === "unblocked") {
      transitionProceeded.current = false;
      return;
    }
    if (blocker.state === "blocked" && !dirty && !saving) continueBlockedNavigation();
  }, [blocker.state, continueBlockedNavigation, dirty, saving]);

  function proceedAfterSavedTransition(): boolean {
    if (!proceedAfterSave.current) return false;
    proceedAfterSave.current = false;
    continueBlockedNavigation();
    return true;
  }

  function navigateWithoutPrompt(to: string, options?: { replace?: boolean }): void {
    bypassNextNavigation.current = true;
    navigate(to, options);
  }

  const stayOnPage = useCallback(() => {
    proceedAfterSave.current = false;
    transitionProceeded.current = false;
    if (blockerRef.current.state === "blocked") blockerRef.current.reset();
  }, []);

  function leaveWithoutSaving(): void {
    proceedAfterSave.current = false;
    continueBlockedNavigation();
  }

  function saveAndLeave(): void {
    proceedAfterSave.current = true;
    if (!saving) submit({ manual: true });
  }

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
          if (proceedAfterSavedTransition()) return;
          navigateWithoutPrompt(`/shipments/${saved.id}`, { replace: true });
        } else {
          setPristine(form);
          toast.show("Сохранено");
          proceedAfterSavedTransition();
        }
      },
      onError: (err) => {
        proceedAfterSave.current = false;
        autoSaveBlocked.current = true;
        setError(describe(err, "Не удалось сохранить заявку"));
      },
    });
  }

  function discard() {
    setError("");
    if (isNew) {
      navigateWithoutPrompt("/shipments");
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

  const selectedLead = leads.find((l) => l.id === form.lead_id) ?? selectedLeadDetails;
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
      onUpload={(file, entryId) => uploadAttachment.mutate({ file, entryId })}
      onDelete={(file) => deleteAttachment.mutate(file.id)}
      onPreview={(file) => setPreview(file)}
      onEditNote={(entryId, body) => editNote.mutate({ entryId, body })}
      onDeleteEntry={(entry) => deleteEntry.mutate(Number(entry.id))}
      currentUserId={currentUser?.id}
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
                        {isNew ? (
                          <Field label="Лид" htmlFor="ship-lead-select">
                            <div className="space-y-1">
                              <SInput
                                aria-label="Поиск лида"
                                placeholder="Поиск по названию или ИНН"
                                value={leadSearch}
                                onChange={(e) => setLeadSearch(e.target.value)}
                              />
                              <select
                                id="ship-lead-select"
                                className={selectStateCls(Boolean(form.lead_id))}
                                value={form.lead_id || ""}
                                onChange={(e) => set("lead_id", Number(e.target.value) || 0)}
                              >
                                <option value="">Выберите лид</option>
                                {selectedLeadDetails &&
                                  !leads.some((lead) => lead.id === selectedLeadDetails.id) && (
                                    <option value={selectedLeadDetails.id}>
                                      {selectedLeadDetails.name} · {selectedLeadDetails.inn}
                                    </option>
                                  )}
                                {leads.map((lead) => (
                                  <option key={lead.id} value={lead.id}>
                                    {lead.name} · {lead.inn}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </Field>
                        ) : (
                          <Field label="Заказчик">
                            <span className="px-1.5 py-[3px] text-odoo-text">
                              {selectedLead?.name || title}
                            </span>
                          </Field>
                        )}
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
                  </FormGroup>

                  {/* --- Погрузка / Выгрузка --- */}
                  <FormGroup>
                    <LoadingGroup
                      loadingCities={form.loading_cities}
                      addressLoading={form.address_loading}
                      contactLoadingName={form.contact_loading_name}
                      loadingDateFrom={form.loading_date_from}
                      loadingDateTo={form.loading_date_to}
                      loadingTimeFrom={form.loading_time_from}
                      onLoadingCitiesChange={(v) => set("loading_cities", v)}
                      onAddressLoadingChange={(v) => set("address_loading", v)}
                      onContactLoadingNameChange={(v) => set("contact_loading_name", v)}
                      onLoadingDateFromChange={(v) => set("loading_date_from", v)}
                      onLoadingDateToChange={(v) => set("loading_date_to", v)}
                      onLoadingTimeFromChange={(v) => set("loading_time_from", v)}
                    />

                    <UnloadingGroup
                      unloadingCities={form.unloading_cities}
                      addressUnloading={form.address_unloading}
                      contactUnloadingName={form.contact_unloading_name}
                      unloadingDateFrom={form.unloading_date_from}
                      unloadingDateTo={form.unloading_date_to}
                      unloadingTimeFrom={form.unloading_time_from}
                      onUnloadingCitiesChange={(v) => set("unloading_cities", v)}
                      onAddressUnloadingChange={(v) => set("address_unloading", v)}
                      onContactUnloadingNameChange={(v) => set("contact_unloading_name", v)}
                      onUnloadingDateFromChange={(v) => set("unloading_date_from", v)}
                      onUnloadingDateToChange={(v) => set("unloading_date_to", v)}
                      onUnloadingTimeFromChange={(v) => set("unloading_time_from", v)}
                    />
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

                    <CargoGroup
                      cargoType={form.cargo_type}
                      cargoPackaging={form.cargo_packaging}
                      cargoVolume={form.cargo_volume}
                      cargoWeight={form.cargo_weight}
                      capacity={form.capacity}
                      bodyType={form.body_type}
                      loadingMethod={form.loading_method}
                      transportType={form.transport_type}
                      onCargoTypeChange={(v) => set("cargo_type", v)}
                      onCargoPackagingChange={(v) => set("cargo_packaging", v)}
                      onCargoVolumeChange={(v) => set("cargo_volume", v)}
                      onCargoWeightChange={(v) => set("cargo_weight", v)}
                      onCapacityChange={(v) => set("capacity", v)}
                      onBodyTypeChange={(v) => set("body_type", v)}
                      onLoadingMethodChange={(v) => set("loading_method", v)}
                      onTransportTypeChange={(v) => set("transport_type", v)}
                    />
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
                            deductionRate={meta ? Number(meta.margin_deduction_rate) : null}
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

      {blocker.state === "blocked" && (
        <UnsavedChangesDialog
          saving={saving}
          canSave={!!form.lead_id && (isNew || form.number.trim().length > 0)}
          error={error}
          onSaveAndLeave={saveAndLeave}
          onLeaveWithoutSaving={leaveWithoutSaving}
          onStay={stayOnPage}
        />
      )}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </AppShell>
  );
}
