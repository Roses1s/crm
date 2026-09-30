import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { ApiError } from "@/shared/api/client";
import {
  useAddShipmentNote,
  useCarriers,
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
  useUploadShipmentAttachment,
  type ShipmentPayload,
} from "@/shared/api/hooks";
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
  OdooInput,
} from "@/shared/ui/odoo-form";
import { FormSkeleton } from "@/shared/ui/skeleton";

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

const selectCls =
  "w-full rounded-[3px] border border-transparent bg-transparent px-1 py-[2px] text-[13px] leading-[19px] text-odoo-text outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus/40";

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
  // key по id: переход между заявками пересоздаёт форму.
  return <ShipmentForm key={id ?? "new"} id={id} />;
}

function ShipmentForm({ id }: { id?: string }) {
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: currentUser } = useMe();
  const { data: shipment, isLoading } = useShipment(id);
  const { data: carriers = [] } = useCarriers();
  const { data: leads = [] } = useLeads();
  const { data: timeline = [] } = useShipmentTimeline(id);
  const { data: attachments = [] } = useShipmentAttachments(shipment?.id);

  const save = useSaveShipment(id);
  const setStatus = useSetShipmentStatus(id);
  const addNote = useAddShipmentNote(id);
  const editNote = useEditShipmentNote(id);
  const deleteEntry = useDeleteShipmentTimelineEntry(id);
  const uploadAttachment = useUploadShipmentAttachment(shipment?.id);
  const deleteAttachment = useDeleteShipmentAttachment(shipment?.id);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [pristine, setPristine] = useState<FormState>(emptyForm);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Attachment | null>(null);
  const loadedId = useRef<number | null>(null);

  // Заявка из карточки лида приходит со ссылкой /shipments/new?lead=42.
  useEffect(() => {
    const leadParam = searchParams.get("lead");
    if (isNew && leadParam)
      setForm((f) => ({ ...f, lead_id: Number(leadParam) }));
  }, [isNew, searchParams]);

  // Загруженную карточку кладём в форму один раз, чтобы фоновое обновление
  // не затирало несохранённые правки.
  useEffect(() => {
    if (shipment && loadedId.current !== shipment.id) {
      loadedId.current = shipment.id;
      const next: FormState = {
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
      };
      setForm(next);
      setPristine(next);
    }
  }, [shipment]);

  const dirty = isNew
    ? form.lead_id !== 0
    : JSON.stringify(form) !== JSON.stringify(pristine);
  const saving = save.isPending;

  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function describe(err: unknown, fallback: string): string {
    if (err instanceof ApiError) return err.message;
    return fallback;
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
      onSuccess: (saved) => {
        if (isNew) {
          navigate(`/shipments/${saved.id}`, { replace: true });
        } else {
          setPristine(form);
        }
      },
      onError: (err) => setError(describe(err, "Не удалось сохранить заявку")),
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

  // Смена этапа у сохранённой заявки уходит на сервер сразу — как в Odoo.
  function selectStage(stageIndex: number) {
    const stage = STAGES[stageIndex];
    if (!stage || isNew) return;
    if (shipment && stage.value === shipment.status) return;
    setStatus.mutate(stage.value, {
      onError: (err) => setError(describe(err, "Не удалось изменить этап")),
    });
  }

  const currentStageId =
    STAGES.find((s) => s.value === shipment?.status)?.id ?? 0;

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
        crumbs={[
          { label: "Заявки", to: "/shipments" },
          { label: isNew ? "Новая заявка" : title },
        ]}
        status={
          <FormStatusIndicator
            dirty={dirty}
            saving={saving}
            onSave={submit}
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
                  <span className="block px-0 text-[24px] font-normal leading-[34px] text-odoo-text">
                    {title}
                  </span>
                </FormTitle>

                <FormGroup>
                  <div>
                    <InnerGroup title="Клиент и перевозчик">
                      <Field label="Клиент (лид)" htmlFor="ship-lead">
                        <select
                          id="ship-lead"
                          className={selectCls}
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
                      </Field>
                      <Field label="Перевозчик" htmlFor="ship-carrier">
                        <select
                          id="ship-carrier"
                          className={selectCls}
                          value={form.carrier_id ?? ""}
                          onChange={(e) =>
                            set(
                              "carrier_id",
                              e.target.value ? Number(e.target.value) : null,
                            )
                          }
                        >
                          <option value="">—</option>
                          {carriers.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Тип транспорта" htmlFor="ship-transport">
                        <select
                          id="ship-transport"
                          className={selectCls}
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

                    <InnerGroup title="Груз">
                      <Field label="Вес, т" htmlFor="ship-weight">
                        <OdooInput
                          id="ship-weight"
                          inputMode="decimal"
                          value={form.cargo_weight}
                          onChange={(e) => set("cargo_weight", e.target.value)}
                        />
                      </Field>
                      <Field label="Объём, м³" htmlFor="ship-volume">
                        <OdooInput
                          id="ship-volume"
                          inputMode="decimal"
                          value={form.cargo_volume}
                          onChange={(e) => set("cargo_volume", e.target.value)}
                        />
                      </Field>
                      <Field label="Комментарий" htmlFor="ship-comment">
                        <textarea
                          id="ship-comment"
                          rows={2}
                          className={`${selectCls} resize-none`}
                          value={form.comment}
                          onChange={(e) => set("comment", e.target.value)}
                        />
                      </Field>
                    </InnerGroup>
                  </div>

                  <div>
                    <InnerGroup title="Маршрут">
                      <Field label="Город погрузки" htmlFor="ship-city-load">
                        <OdooInput
                          id="ship-city-load"
                          value={form.city_loading}
                          onChange={(e) => set("city_loading", e.target.value)}
                        />
                      </Field>
                      <Field label="Адрес погрузки" htmlFor="ship-addr-load">
                        <OdooInput
                          id="ship-addr-load"
                          value={form.address_loading}
                          onChange={(e) => set("address_loading", e.target.value)}
                        />
                      </Field>
                      <Field label="Город выгрузки" htmlFor="ship-city-unload">
                        <OdooInput
                          id="ship-city-unload"
                          value={form.city_unloading}
                          onChange={(e) => set("city_unloading", e.target.value)}
                        />
                      </Field>
                      <Field label="Адрес выгрузки" htmlFor="ship-addr-unload">
                        <OdooInput
                          id="ship-addr-unload"
                          value={form.address_unloading}
                          onChange={(e) =>
                            set("address_unloading", e.target.value)
                          }
                        />
                      </Field>
                    </InnerGroup>

                    <InnerGroup title="Контакты">
                      <Field label="Контакт на погрузке" htmlFor="ship-load-name">
                        <OdooInput
                          id="ship-load-name"
                          placeholder="Фамилия Имя"
                          value={form.contact_loading_name}
                          onChange={(e) =>
                            set("contact_loading_name", e.target.value)
                          }
                        />
                      </Field>
                      <Field label="Телефон на погрузке" htmlFor="ship-load-phone">
                        <OdooInput
                          id="ship-load-phone"
                          placeholder="+7 900 000-00-00"
                          value={form.contact_loading_phone}
                          onChange={(e) =>
                            set("contact_loading_phone", e.target.value)
                          }
                        />
                      </Field>
                      <Field label="Контакт на выгрузке" htmlFor="ship-unload-name">
                        <OdooInput
                          id="ship-unload-name"
                          placeholder="Фамилия Имя"
                          value={form.contact_unloading_name}
                          onChange={(e) =>
                            set("contact_unloading_name", e.target.value)
                          }
                        />
                      </Field>
                      <Field
                        label="Телефон на выгрузке"
                        htmlFor="ship-unload-phone"
                      >
                        <OdooInput
                          id="ship-unload-phone"
                          placeholder="+7 900 000-00-00"
                          value={form.contact_unloading_phone}
                          onChange={(e) =>
                            set("contact_unloading_phone", e.target.value)
                          }
                        />
                      </Field>
                    </InnerGroup>
                  </div>
                </FormGroup>
              </>
            )}
          </FormSheet>
        </FormSheetBg>
        </main>
      </FormWorkspace>

      {preview && (
        <FilePreview file={preview} onClose={() => setPreview(null)} />
      )}
    </AppShell>
  );
}
