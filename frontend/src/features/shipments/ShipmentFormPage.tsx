import { Copy, FileText, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { ApiError } from "@/shared/api/client";
import {
  useAddShipmentNote,
  useDeleteShipment,
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
  FormAlert,
  FormGroup,
  FormSheet,
  FormSheetBg,
  FormStatusIndicator,
  FormStatusbar,
  FormTitle,
  FormWorkspace,
  Notebook,
  OdooInput,
} from "@/shared/ui/odoo-form";
import { FormSkeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast-context";
import { fromDatetimeLocal, toDatetimeLocal } from "./shipment-form/helpers";
import { CarrierGroup } from "./shipment-form/CarrierGroup";
import { CargoGroup } from "./shipment-form/CargoGroup";
import { LoadingGroup } from "./shipment-form/LoadingGroup";
import { OrderLinesTab } from "./shipment-form/OrderLinesTab";
import { ShipmentHeaderGroup } from "./shipment-form/ShipmentHeaderGroup";
import { UnloadingGroup } from "./shipment-form/UnloadingGroup";
import { STextarea } from "./shipment-form/fields";
import { DeleteShipmentDialog } from "./DeleteShipmentDialog";

// Этапы заявки образуют единую воронку (Новая → … → Машина выгрузилась).
// Статусбар обращается к этапам по числовым id, поэтому рядом со значением
// статуса храним и id (позицию в воронке).
const STAGES = [
  { id: 0, value: "new", name: "Новая" },
  { id: 1, value: "checked", name: "Проверена и подписана заявка" },
  { id: 2, value: "loaded", name: "Машина загрузилась" },
  { id: 3, value: "unloaded", name: "Машина выгрузилась" },
] as const;

const emptyForm = {
  number: "",
  lead_id: 0,
  // Дата создания по умолчанию — текущий момент (проставляет эффект при
  // открытии формы новой заявки, ниже), но при заведении её разрешено
  // поправить задним числом (toDatetimeLocal/fromDatetimeLocal).
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

  // Позиция заказа: единственная строка «ТЭО» бланка.
  customer_price: "",
  customer_tax: "vat_22",
  carrier_price: "",
  carrier_tax: "vat_22",

  // Заказчик: шапка бланка.
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

  // Перевозчик: свободный текст прямо в заявке, без справочника.
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

  // Поле тегов убрано из карточки 03.10.2026, но значения продолжают
  // ездить на сервер и обратно: уже проставленные теги не должны
  // стираться обычным сохранением формы.
  tag_ids: [] as number[],
};

type FormState = typeof emptyForm;

export function ShipmentFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  // Ключ по id и query: копия/новая заявка с выбранным лидом — отдельные
  // состояния формы, они не должны наследовать черновик друг друга.
  return <ShipmentForm key={`${id ?? "new"}?${searchParams.toString()}`} id={id} />;
}

function ShipmentForm({ id }: { id?: string }) {
  const isNew = !id || id === "new";
  // Как и в карточке лида: номер известен из адреса сразу, поэтому
  // вложения не ждут отдельного ответа по самой заявке.
  const savedId = isNew ? undefined : id;
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const copySourceId = isNew ? searchParams.get("copy") || undefined : undefined;
  const isCopy = Boolean(copySourceId);
  const [leadSearch, setLeadSearch] = useState("");

  const { data: currentUser } = useMe();
  // Ставку вычета маржи берём с сервера: единственная копия живёт в
  // бэкенде (Т-08), фронтенд свою не держит.
  const { data: meta } = useMeta();
  const {
    data: shipment,
    isLoading: shipmentLoading,
    isError: shipmentLoadFailed,
  } = useShipment(isCopy ? copySourceId : id);
  const { data: leadsPage } = useLeads(isNew ? { search: leadSearch } : {});
  const leads = leadsPage?.items ?? [];
  const { data: timeline = [] } = useShipmentTimeline(id);
  const { data: attachments = [] } = useShipmentAttachments(savedId);

  const save = useSaveShipment(id);
  const deleteShipment = useDeleteShipment(id);
  const setStatus = useSetShipmentStatus(id);
  const addNote = useAddShipmentNote(id);
  const editNote = useEditShipmentNote(id);
  const deleteEntry = useDeleteShipmentTimelineEntry(id);
  const uploadAttachment = useUploadShipmentAttachment(savedId);
  const deleteAttachment = useDeleteShipmentAttachment(savedId);

  // Начальное состояние считаем лениво: emptyForm — общий модуль, и
  // «сейчас» должно вычисляться в момент открытия именно этой формы, а
  // не один раз при загрузке приложения.
  const [form, setForm] = useState<FormState>(() => ({
    ...emptyForm,
    created_at: toDatetimeLocal(new Date().toISOString()),
  }));
  const [pristine, setPristine] = useState<FormState>(form);
  const { data: selectedLeadDetails } = useLead(
    isNew && form.lead_id ? String(form.lead_id) : undefined,
  );
  const [error, setError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const [tab, setTab] = useState("lines");
  const loadedId = useRef<number | null>(null);

  // Заявка, созданная из карточки лида, приходит по ссылке вида
  // /shipments/new?lead=42: лид уже выбран и подставляется в форму.
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (isNew && leadParam) {
      const leadId = Number(leadParam);
      setForm((f) => ({ ...f, lead_id: leadId }));
      setPristine((p) => ({ ...p, lead_id: leadId }));
    }
  }, [isNew, searchParams]);

  // Загруженную карточку кладём в форму один раз: фоновое обновление
  // данных не должно затирать несохранённые правки пользователя.
  useEffect(() => {
    if (shipment && loadedId.current !== shipment.id) {
      loadedId.current = shipment.id;
      const next: FormState = {
        number: isCopy ? "" : (shipment.number ?? ""),
        created_at: isCopy
          ? toDatetimeLocal(new Date().toISOString())
          : toDatetimeLocal(shipment.created_at),
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
      if (isCopy) {
        // Новая копия должна оставаться черновиком до явного сохранения,
        // но кнопка «Сохранить» доступна сразу, даже без ручных правок.
        setPristine({ ...emptyForm, created_at: next.created_at });
      } else {
        setPristine(next);
      }
    }
  }, [isCopy, shipment]);

  const dirty = JSON.stringify(form) !== JSON.stringify(pristine);
  const saving = save.isPending;
  // После неудачной попытки автосохранение выключается и включается
  // снова только от новой правки руками. Иначе неудачный запрос
  // повторялся бы каждые 3 секунды, пока открыта вкладка.
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

  // Если сохранение завершилось уже во время перехода со страницы,
  // продолжаем сценарий перехода только один раз, а не повторно.
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

  function openDeleteDialog(): void {
    if (!shipment || isNew || saving || deleteShipment.isPending) return;
    deleteShipment.reset();
    autoSaveBlocked.current = true;
    setDeleteOpen(true);
  }

  function closeDeleteDialog(): void {
    if (deleteShipment.isPending) return;
    autoSaveBlocked.current = false;
    setDeleteOpen(false);
    deleteShipment.reset();
  }

  function deleteForever(): void {
    if (!shipment || isNew || saving || deleteShipment.isPending) return;
    deleteShipment.mutate(undefined, {
      onSuccess: () => {
        setDeleteOpen(false);
        toast.show(`Заявка №${shipment.number} удалена`);
        navigateWithoutPrompt("/shipments");
      },
    });
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
    // упасть именно из-за значения, которое сейчас исправляют.
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
    // У новой заявки номера ещё нет (поле пустое до создания, сервер сам
    // подставит id). У существующей номер — единственный видимый
    // идентификатор: стирать его в пустоту нельзя, восстановиться ему
    // будет не из чего.
    if (!isNew && !form.number.trim()) {
      setError("Номер заявки не может быть пустым");
      return;
    }
    const payload: ShipmentPayload = {
      ...form,
      number: form.number.trim(),
      // Поле по умолчанию заполнено («сейчас»), но если человек всё-таки
      // очистил его руками, пустую строку не шлём: сервер не примет
      // null/"" в колонку NOT NULL — дату в этом случае просто не меняем.
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

  // Автосохранение: через 3 секунды без правок сохраняем сами. Кнопка в
  // шапке остаётся — для спокойствия и ради сохранения сразу, не
  // дожидаясь таймера. Ещё не созданную заявку автосохранение не трогает:
  // её создаёт только пользователь явным сохранением.
  useEffect(() => {
    if (
      isNew ||
      !dirty ||
      saving ||
      deleteOpen ||
      deleteShipment.isPending ||
      autoSaveBlocked.current
    )
      return;
    const timer = setTimeout(() => submit(), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, dirty, saving, deleteOpen, deleteShipment.isPending, form]);

  // Смена этапа у сохранённой заявки уходит на сервер сразу, без кнопки
  // сохранения, — как в Odoo.
  function selectStage(stageIndex: number) {
    const stage = STAGES[stageIndex];
    if (!stage || isNew) return;
    if (shipment && stage.value === shipment.status) return;
    setStatus.mutate(stage.value, {
      onError: (err) => setError(describe(err, "Не удалось изменить этап")),
    });
  }

  const currentStageId = isNew ? 0 : (STAGES.find((s) => s.value === shipment?.status)?.id ?? 0);

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
        crumbs={[
          { label: "Заявки", to: "/shipments" },
          { label: isCopy ? "Копия заявки" : isNew ? "Новая заявка" : title },
        ]}
        cog={
          !isNew ? (
            <>
              <button
                type="button"
                aria-label="Копировать заявку"
                title="Создать новую заявку на основе этой"
                onClick={() => navigate(`/shipments/new?copy=${encodeURIComponent(id ?? "")}`)}
                className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-odoo-border bg-odoo-surface px-2 text-[12px] text-odoo-text hover:bg-odoo-bg"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Копировать</span>
              </button>
              {currentUser?.role === "admin" && shipment && (
                <button
                  type="button"
                  aria-label="Удалить заявку"
                  title="Безвозвратно удалить заявку"
                  disabled={saving || deleteShipment.isPending}
                  onClick={openDeleteDialog}
                  className="inline-flex h-7 items-center gap-1 rounded-[4px] border border-odoo-danger/30 bg-odoo-surface px-2 text-[12px] text-odoo-danger hover:bg-odoo-danger/10 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Удалить</span>
                </button>
              )}
            </>
          ) : undefined
        }
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
              {isCopy && shipmentLoadFailed ? (
                <FormAlert>Не удалось загрузить исходную заявку для копирования.</FormAlert>
              ) : shipmentLoading && (!isNew || isCopy) ? (
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
                    <ShipmentHeaderGroup
                      isNew={isNew}
                      createdAt={form.created_at}
                      onCreatedAtChange={(v) => set("created_at", v)}
                      leadSearch={leadSearch}
                      onLeadSearchChange={setLeadSearch}
                      leadId={form.lead_id}
                      onLeadIdChange={(v) => set("lead_id", v)}
                      leads={leads}
                      selectedLeadDetails={selectedLeadDetails}
                      customerName={selectedLead?.name || title}
                      customerInn={selectedLead?.inn}
                      customerContact={form.customer_contact}
                      onCustomerContactChange={(v) => set("customer_contact", v)}
                    />
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
                    <CarrierGroup
                      carrierName={form.carrier_name}
                      carrierInn={form.carrier_inn}
                      carrierContact={form.carrier_contact}
                      vehicle={form.vehicle}
                      vehicleNumber={form.vehicle_number}
                      hasTrailer={form.has_trailer}
                      trailerNumber={form.trailer_number}
                      driverName={form.driver_name}
                      driverPhone={form.driver_phone}
                      driverPassport={form.driver_passport}
                      carrierSigner={form.carrier_signer}
                      onCarrierNameChange={(v) => set("carrier_name", v)}
                      onCarrierInnChange={(v) => set("carrier_inn", v)}
                      onCarrierContactChange={(v) => set("carrier_contact", v)}
                      onVehicleChange={(v) => set("vehicle", v)}
                      onVehicleNumberChange={(v) => set("vehicle_number", v)}
                      onHasTrailerChange={(v) => set("has_trailer", v)}
                      onTrailerNumberChange={(v) => set("trailer_number", v)}
                      onDriverNameChange={(v) => set("driver_name", v)}
                      onDriverPhoneChange={(v) => set("driver_phone", v)}
                      onDriverPassportChange={(v) => set("driver_passport", v)}
                      onCarrierSignerChange={(v) => set("carrier_signer", v)}
                    />

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
      {deleteOpen && shipment && (
        <DeleteShipmentDialog
          shipmentNumber={shipment.number}
          pending={deleteShipment.isPending}
          error={
            deleteShipment.isError
              ? describe(deleteShipment.error, "Не удалось удалить заявку")
              : ""
          }
          onCancel={closeDeleteDialog}
          onConfirm={deleteForever}
        />
      )}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </AppShell>
  );
}
