import { ChevronLeft, ChevronRight, FileText, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { StarRating } from "@/features/crm/board/StarRating";
import { ACCOUNTANT_NAMES } from "@/features/crm/lead-form/accountant-options";
import { TagsField } from "@/features/crm/lead-form/TagsField";
import {
  empty,
  normalized,
  toForm,
  toPayload,
  type FormState,
} from "@/features/crm/lead-form/form-state";
import { ApiError } from "@/shared/api/client";
import {
  useAddNote,
  useCreateLead,
  useCustomersByInn,
  useDeleteAttachment,
  useDeleteLead,
  useDeleteTimelineEntry,
  useEditNote,
  useLead,
  useLeadAttachments,
  useLeadPager,
  useLeadShipments,
  useLeadTimeline,
  useLoseLead,
  useMe,
  useRestoreLead,
  useStages,
  useTags,
  useUpdateLead,
  useTransferLead,
  useUploadAttachment,
} from "@/shared/api/hooks";
import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import type { Attachment } from "@/shared/types";
import { DeleteLeadDialog } from "@/features/crm/lead-form/DeleteLeadDialog";
import { LoseLeadDialog } from "@/features/crm/lead-form/LoseLeadDialog";
import { QuickCreateLeadDialog } from "@/features/crm/lead-form/QuickCreateLeadDialog";
import { QuickCreateShipmentDialog } from "@/features/shipments/QuickCreateShipmentDialog";
import { formatShipmentDate, SHIPMENT_STATUS } from "@/features/shipments/shipment-status";
import { LostRibbon } from "@/features/crm/lead-form/LostRibbon";
import { TransferDialog } from "@/features/crm/lead-form/TransferDialog";
import { Chatter } from "@/shared/ui/chatter";
import { FilePreview } from "@/shared/ui/file-preview";
import {
  Field,
  FormAlert,
  FormGroup,
  FormSheet,
  FormWorkspace,
  FormSheetBg,
  FormStatusIndicator,
  FormStatusbar,
  FormTitle,
  InnerGroup,
  Notebook,
  OdooInput,
} from "@/shared/ui/odoo-form";
import { FormSkeleton } from "@/shared/ui/skeleton";
import { useToast } from "@/shared/ui/toast-context";

export function LeadFormPage() {
  const { id } = useParams();
  // key по id: переход «предыдущий / следующий лид» пересоздаёт форму.
  return <LeadForm key={id ?? "new"} id={id} />;
}

function LeadForm({ id }: { id?: string }) {
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const toast = useToast();
  // Номер лида известен сразу из адреса, поэтому заявки и вложения уходят
  // на сервер вместе с самим лидом, а не вторым заходом после его ответа.
  const savedId = isNew ? undefined : id;

  const { data: currentUser } = useMe();
  const { data: lead, isLoading } = useLead(id);
  const { data: stages = [] } = useStages();
  const { data: allTags = [] } = useTags();
  const { data: timeline = [] } = useLeadTimeline(id);
  const { data: shipments = [] } = useLeadShipments(savedId);
  const { data: pager } = useLeadPager(id);
  const { data: attachments = [] } = useLeadAttachments(savedId);

  const createLead = useCreateLead();
  const updateLead = useUpdateLead(id);
  const loseLead = useLoseLead();
  const restoreLead = useRestoreLead();
  const deleteLead = useDeleteLead();
  const addNote = useAddNote(id);
  const editNote = useEditNote(id);
  const deleteTimelineEntry = useDeleteTimelineEntry(id);
  const uploadAttachment = useUploadAttachment(savedId);
  const transferLead = useTransferLead(savedId);
  const deleteAttachment = useDeleteAttachment(savedId);

  const [form, setForm] = useState<FormState>(empty);
  const [pristine, setPristine] = useState<FormState>(empty);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("shipments");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  // Передача лида коллеге: диалог выбора и подтверждения.
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferError, setTransferError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Отметить проигрышем: диалог с выбором причины.
  const [loseOpen, setLoseOpen] = useState(false);
  const [loseError, setLoseError] = useState("");
  const [restoreError, setRestoreError] = useState("");
  // Кнопка «Новый» в шапке карточки — та же простая форма, что и на доске.
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  // Кнопка «Создать заявку» — простая форма вместо полного бланка заявки.
  const [shipmentCreateOpen, setShipmentCreateOpen] = useState(false);
  const loadedId = useRef<number | null>(null);
  // Автосохранение выключается после неудачной попытки и включается снова,
  // когда человек что-то поправил. Без этого форма оставалась «грязной», и
  // неудачный запрос повторялся каждые 3 секунды, пока открыта вкладка.
  const autoSaveBlocked = useRef(false);

  // Предупреждение о дубле ИНН — некритичное, не блокирует сохранение;
  // проверяется и при создании, и при редактировании (свой же лид исключён
  // через exclude_id, иначе лид бы постоянно «находил дубль самого себя»).
  const { data: sameInn = [] } = useCustomersByInn(form.inn.trim(), lead?.id);

  // Загруженную карточку кладём в форму один раз: фоновое обновление
  // не должно затирать несохранённые правки.
  useEffect(() => {
    if (lead && loadedId.current !== lead.id) {
      loadedId.current = lead.id;
      const next = toForm(lead);
      setForm(next);
      setPristine(next);
    }
  }, [lead]);

  // У новой карточки этап по умолчанию — первый в воронке.
  useEffect(() => {
    if (isNew && stages.length && !form.stage_id) {
      setForm((f) => ({ ...f, stage_id: stages[0].id }));
    }
  }, [isNew, stages, form.stage_id]);

  const dirty = isNew ? form.name.trim() !== "" : normalized(form) !== normalized(pristine);
  const saving = createLead.isPending || updateLead.isPending;

  // Предупреждение браузера при уходе со страницы с несохранёнными правками.
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
    if (err instanceof ApiError) {
      if (err.status === 422)
        return "Проверьте поля: ИНН должен быть из 10 или 12 цифр с верной контрольной суммой";
      if (err.status === 403) return "Недостаточно прав для этого действия";
      return err.message;
    }
    return fallback;
  }

  function save(options: { manual?: boolean } = {}) {
    if (options.manual) autoSaveBlocked.current = false;
    setError("");
    if (!form.name.trim()) {
      setError("Укажите название лида");
      return;
    }
    const payload = toPayload(form);

    if (isNew) {
      createLead.mutate(payload, {
        onSuccess: (created) => navigate(`/crm/leads/${created.id}`, { replace: true }),
        onError: (err) => {
          autoSaveBlocked.current = true;
          setError(describe(err, "Не удалось создать лид"));
        },
      });
    } else {
      updateLead.mutate(payload, {
        onSuccess: (updated) => {
          const next = toForm(updated);
          setForm(next);
          setPristine(next);
          toast.show("Сохранено");
        },
        onError: (err) => {
          autoSaveBlocked.current = true;
          setError(describe(err, "Не удалось сохранить"));
        },
      });
    }
  }

  function discard() {
    setError("");
    if (isNew) {
      navigate("/crm");
      return;
    }
    setForm(pristine);
  }

  // Автосохранение: через 3с без правок сохраняем сами, кнопка в хедере
  // остаётся — для спокойствия и чтобы сохранить можно было сразу, не ждя.
  // Новую (ещё не созданную) карточку не трогаем — её создаёт только сам
  // пользователь явным сохранением.
  useEffect(() => {
    if (isNew || !dirty || saving || autoSaveBlocked.current) return;
    const timer = setTimeout(() => save(), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, dirty, saving, form]);

  function confirmLose(reasonId: number) {
    if (!lead) return;
    setLoseError("");
    loseLead.mutate(
      { id: lead.id, reasonId },
      {
        onSuccess: () => {
          setLoseOpen(false);
          navigate("/crm");
        },
        onError: (err) => setLoseError(describe(err, "Не удалось отметить лид проигранным")),
      },
    );
  }

  function restore() {
    if (!lead) return;
    setRestoreError("");
    restoreLead.mutate(lead.id, {
      onError: (err) => setRestoreError(describe(err, "Не удалось восстановить лид")),
    });
  }

  function deleteForever() {
    if (!lead) return;
    setDeleteError("");
    deleteLead.mutate(lead.id, {
      onSuccess: () => navigate("/crm"),
      onError: (err) => setDeleteError(describe(err, "Не удалось удалить лид")),
    });
  }

  // Смена этапа у сохранённой карточки уходит на сервер сразу — как в Odoo.
  function selectStage(stageId: number) {
    if (stageId === form.stage_id) return;
    set("stage_id", stageId);
    if (isNew) return;
    updateLead.mutate(
      { stage_id: stageId },
      {
        onSuccess: (updated) => setPristine((p) => ({ ...p, stage_id: updated.stage_id })),
        onError: (err) => {
          set("stage_id", pristine.stage_id);
          setError(describe(err, "Не удалось изменить этап"));
        },
      },
    );
  }

  const owner = lead ? ownerLabel(lead) : "";
  const ownerAvatar = lead ? ownerInitials(lead) : "—";
  const isOwner = !!lead && !!currentUser && lead.assigned_to_id === currentUser.id;
  // Проигранный чужой лид можно посмотреть целиком, но не менять — пока не
  // забрали его себе кнопкой «Взять себе» (админ может редактировать всегда).
  const readOnly = !!lead && lead.is_archived && !isOwner && currentUser?.role !== "admin";
  const composerInitial = (currentUser?.first_name || currentUser?.email || "Я")
    .slice(0, 1)
    .toUpperCase();

  const notebookTabs = [
    {
      id: "shipments",
      label: `Заявки (${shipments.length})`,
      content: (
        <div className="-mx-4 lg:-mx-6">
          <table className="w-full border-collapse text-[13px] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr>
                <th className="w-[100px] bg-odoo-bg px-2 py-1.5 pl-4 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))] lg:pl-6">
                  №
                </th>
                <th className="w-[170px] bg-odoo-bg px-2 py-1.5 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]">
                  Дата создания
                </th>
                <th className="bg-odoo-bg px-2 py-1.5 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]">
                  Маршрут
                </th>
                <th className="w-[160px] bg-odoo-bg px-2 py-1.5 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]">
                  Перевозчик
                </th>
                <th className="w-[180px] bg-odoo-bg px-2 py-1.5 pr-4 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))] lg:pr-6">
                  Статус
                </th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-odoo-text-muted lg:px-6">
                    Пока нет заявок по этому лиду.
                  </td>
                </tr>
              )}
              {shipments.map((s) => {
                const st = SHIPMENT_STATUS[s.status] ?? SHIPMENT_STATUS.new;
                return (
                  <tr
                    key={s.id}
                    className="border-b border-odoo-border-light hover:bg-odoo-surface-hover"
                  >
                    <td className="px-2 py-1 pl-4 lg:pl-6">
                      <Link className="text-odoo-action hover:underline" to={`/shipments/${s.id}`}>
                        {s.number}
                      </Link>
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-odoo-text-muted">
                      {formatShipmentDate(s.created_at)}
                    </td>
                    <td className="truncate px-2 py-1" title={s.route}>
                      {s.route}
                    </td>
                    <td className="truncate px-2 py-1 text-odoo-text-muted">
                      {s.carrier_name || "—"}
                    </td>
                    <td className="truncate px-2 py-1 pr-4 lg:pr-6">
                      <span
                        className={`inline-flex rounded-[10px] px-2 py-0.5 text-[11px] font-medium ${st.cls}`}
                      >
                        {st.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-4 pt-2 lg:px-6">
            <button
              type="button"
              onClick={() => setShipmentCreateOpen(true)}
              className="text-[13px] text-odoo-action hover:underline"
            >
              Добавить заявку
            </button>
          </div>
        </div>
      ),
    },
  ];

  const chatter = !isNew ? (
    <Chatter
      timeline={timeline}
      authorInitials={composerInitial}
      attachments={attachments}
      posting={addNote.isPending || uploadAttachment.isPending}
      uploading={uploadAttachment.isPending}
      onSubmit={(body, files) => {
        // Сначала создаём запись, затем цепляем к ней файлы —
        // так вложения попадают именно в эту строку ленты.
        if (!body && files.length === 0) return;
        addNote.mutate(body || "Вложение", {
          onSuccess: (entry) => {
            for (const file of files) {
              uploadAttachment.mutate({
                file,
                entryId: Number(entry.id),
              });
            }
          },
        });
      }}
      onUpload={(file, entryId) => uploadAttachment.mutate({ file, entryId })}
      onDelete={(file) => deleteAttachment.mutate(file.id)}
      onPreview={(file) => setPreview(file)}
      onEditNote={(entryId, body) => editNote.mutate({ entryId, body })}
      onDeleteEntry={(entry) => deleteTimelineEntry.mutate(Number(entry.id))}
      currentUserId={currentUser?.id}
    />
  ) : undefined;

  return (
    <AppShell>
      <ControlPanel
        onNew={() => setQuickCreateOpen(true)}
        crumbs={[{ label: "Лиды", to: "/crm" }, { label: form.name || "Новый лид" }]}
        status={
          <FormStatusIndicator
            dirty={dirty}
            saving={saving}
            onSave={() => save({ manual: true })}
            onDiscard={discard}
          />
        }
        cog={
          !isNew ? (
            <span className="relative inline-flex">
              <button
                type="button"
                aria-label="Действия"
                title="Действия"
                className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-odoo-text-muted transition-colors hover:bg-odoo-bg hover:text-odoo-text"
                onClick={() => setActionsOpen((v) => !v)}
              >
                <Settings className="h-4 w-4" />
              </button>
              {actionsOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10"
                    aria-label="Закрыть"
                    onClick={() => setActionsOpen(false)}
                  />
                  <div className="absolute left-0 top-6 z-50 min-w-[180px] rounded-[3px] border border-odoo-border bg-odoo-surface py-1 shadow-lg">
                    {!lead?.is_archived && (
                      <button
                        type="button"
                        className="block w-full px-3 py-1.5 text-left text-[13px] text-odoo-text hover:bg-odoo-bg disabled:opacity-60"
                        onClick={() => {
                          setActionsOpen(false);
                          setLoseError("");
                          setLoseOpen(true);
                        }}
                      >
                        Отметить проигрышем
                      </button>
                    )}
                    {currentUser?.role === "admin" && (
                      <button
                        type="button"
                        disabled={deleteLead.isPending}
                        className="block w-full px-3 py-1.5 text-left text-[13px] text-odoo-danger hover:bg-odoo-bg disabled:opacity-60"
                        onClick={() => {
                          setActionsOpen(false);
                          setDeleteError("");
                          setDeleteOpen(true);
                        }}
                      >
                        Удалить лид
                      </button>
                    )}
                  </div>
                </>
              )}
            </span>
          ) : null
        }
        stats={
          !isNew ? (
            <span className="inline-flex h-[34px] items-center gap-2 rounded-[4px] border border-odoo-border bg-odoo-surface px-2.5">
              <FileText className="h-4 w-4 text-odoo-text-muted" />
              <span className="flex flex-col items-start leading-[13px]">
                <span className="text-[12px] text-odoo-text">Все заявки</span>
                <span className="text-[11px] text-odoo-text-muted">{shipments.length}</span>
              </span>
            </span>
          ) : null
        }
        pager={
          !isNew && pager ? (
            <span className="flex items-center gap-1">
              <span className="whitespace-nowrap text-[13px] text-odoo-text-muted [font-variant-numeric:tabular-nums]">
                {pager.position} / {pager.total}
              </span>
              <span className="inline-flex h-7 overflow-hidden rounded-[4px] border border-odoo-border bg-odoo-surface">
                <button
                  type="button"
                  aria-label="Предыдущий лид"
                  disabled={!pager.prev_id}
                  onClick={() => pager.prev_id && navigate(`/crm/leads/${pager.prev_id}`)}
                  className="inline-flex w-7 items-center justify-center text-odoo-text-muted transition-colors hover:bg-odoo-bg disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Следующий лид"
                  disabled={!pager.next_id}
                  onClick={() => pager.next_id && navigate(`/crm/leads/${pager.next_id}`)}
                  className="inline-flex w-7 items-center justify-center border-l border-odoo-border text-odoo-text-muted transition-colors hover:bg-odoo-bg disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </span>
          ) : null
        }
      />

      {/*
        Пара «форма + лента» занимает всю доступную ширину. Предел в пикселях
        давал заметные поля по бокам при масштабе браузера меньше 100%.
        Долевая ширина ленты живёт в FormWorkspace, чтобы не расходиться между
        карточками и не превращаться в фиксированные пиксели.
      */}
      <FormWorkspace aside={chatter}>
        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          {/*
            Кнопки действий и лента этапов вынесены на отдельную панель НАД
            листом карточки — как в Odoo 17, где статусбар и кнопки живут в
            панели управления, а не на самом листе.
          */}
          <FormStatusbar
            items={stages}
            current={form.stage_id}
            disabled={saving || readOnly}
            onSelect={selectStage}
            left={
              !isNew ? (
                <>
                  {(!lead?.is_archived || isOwner) && (
                    <button
                      type="button"
                      onClick={() => setShipmentCreateOpen(true)}
                      className="inline-flex h-[30px] items-center rounded-[4px] bg-odoo-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-odoo-primary-hover"
                    >
                      Создать заявку
                    </button>
                  )}
                  {lead?.is_archived ? (
                    <button
                      type="button"
                      disabled={restoreLead.isPending}
                      onClick={restore}
                      title={
                        isOwner
                          ? "Вернуть лид на доску"
                          : "Забрать лид себе: он перейдёт на вашу доску"
                      }
                      className="h-[30px] rounded-[4px] border border-odoo-border bg-odoo-surface px-3 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg disabled:opacity-60"
                    >
                      {restoreLead.isPending
                        ? "Восстанавливаем…"
                        : isOwner
                          ? "Восстановить"
                          : "Взять себе"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setLoseError("");
                        setLoseOpen(true);
                      }}
                      className="h-[30px] rounded-[4px] border border-odoo-border bg-odoo-surface px-3 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg disabled:opacity-60"
                    >
                      Проигрыш
                    </button>
                  )}
                </>
              ) : null
            }
          />
          {restoreError && (
            <div
              role="alert"
              className="mx-4 mt-2 rounded-[4px] border border-odoo-danger/30 bg-odoo-danger/10 px-3 py-2 text-sm text-odoo-danger lg:mx-6"
            >
              {restoreError}
            </div>
          )}

          <FormSheetBg>
            {error && <FormAlert>{error}</FormAlert>}
            {readOnly && (
              <FormAlert tone="warning">
                Этот лид в проигрыше у другого сотрудника — можно только посмотреть. Нажмите «Взять
                себе» выше, чтобы редактировать.
              </FormAlert>
            )}

            <div className={lead?.is_archived ? "relative overflow-hidden" : undefined}>
              {lead?.is_archived && <LostRibbon />}
              <FormSheet>
                {isLoading ? (
                  <FormSkeleton />
                ) : (
                  <>
                    <FormTitle>
                      <OdooInput
                        aria-label="Название лида"
                        placeholder="например, ООО «Ромашка»"
                        className="!px-0 !text-[24px] !leading-[34px]"
                        value={form.name}
                        disabled={readOnly}
                        onChange={(e) => set("name", e.target.value)}
                      />
                    </FormTitle>

                    <FormGroup>
                      <div>
                        <InnerGroup title="Информация о компании">
                          <Field label="Компания" htmlFor="lead-company">
                            {/*
                            «Компания» показывает и редактирует то же название,
                            что и крупный заголовок сверху (одно поле form.name),
                            без отдельного поля в базе.
                          */}
                            <OdooInput
                              id="lead-company"
                              placeholder="например, ООО «Ромашка»"
                              value={form.name}
                              disabled={readOnly}
                              onChange={(e) => set("name", e.target.value)}
                            />
                          </Field>
                          <Field
                            label="ИНН"
                            htmlFor="lead-inn"
                            help="10 или 12 цифр, проверяется контрольная сумма ФНС"
                          >
                            <OdooInput
                              id="lead-inn"
                              inputMode="numeric"
                              placeholder="10 или 12 цифр"
                              value={form.inn}
                              disabled={readOnly}
                              onChange={(e) => set("inn", e.target.value)}
                            />
                          </Field>
                          {sameInn.length > 0 && (
                            <p
                              role="alert"
                              className="rounded-[4px] bg-odoo-tag-yellow-bg px-2.5 py-2 text-[12px] leading-5 text-odoo-tag-yellow-text"
                            >
                              Лид с таким ИНН уже есть: «{sameInn[0].name}»
                              {sameInn[0].assigned_to_name
                                ? `, ответственный — ${sameInn[0].assigned_to_name}`
                                : ""}
                              . Это просто предупреждение, сохранить можно.
                            </p>
                          )}
                          <Field label="Продавец">
                            {/* Щелчок по имени открывает передачу лида коллеге. */}
                            <button
                              type="button"
                              disabled={isNew || readOnly}
                              onClick={() => {
                                setTransferError("");
                                setTransferOpen(true);
                              }}
                              title={
                                isNew
                                  ? "Сначала сохраните лид"
                                  : readOnly
                                    ? "Заберите лид себе, чтобы передать его кому-то ещё"
                                    : "Передать лид другому сотруднику"
                              }
                              className="flex w-full items-center gap-1.5 rounded-[4px] pt-[2px] text-left transition-colors hover:bg-odoo-bg disabled:cursor-default disabled:hover:bg-transparent"
                            >
                              {owner ? (
                                <>
                                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-odoo-primary text-[9px] font-semibold text-white">
                                    {ownerAvatar}
                                  </span>
                                  <span className="truncate">{owner}</span>
                                </>
                              ) : (
                                <span className="text-odoo-text-light">Не назначен</span>
                              )}
                            </button>
                          </Field>
                          {lead?.is_archived && (
                            <Field label="Причина проигрыша">
                              <span className="pt-[2px] text-odoo-text">
                                {lead.loss_reason_name || "—"}
                              </span>
                            </Field>
                          )}
                        </InnerGroup>

                        <InnerGroup verticalAlign="center">
                          <Field label="Назначенный бухгалтер" htmlFor="lead-accountant">
                            <select
                              id="lead-accountant"
                              value={form.accountant_name}
                              disabled={readOnly}
                              onChange={(event) => set("accountant_name", event.target.value)}
                              className="w-full rounded-[3px] border border-transparent bg-transparent px-1 py-[2px] text-[13px] leading-[19px] text-odoo-text outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus/40 disabled:cursor-not-allowed"
                            >
                              <option value="">Выбрать</option>
                              {ACCOUNTANT_NAMES.map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Приоритет">
                            {/*
                            Тот же виджет звёзд, что на канбане: при наведении
                            подсвечивает звёзды до курсора, при уходе возвращает
                            сохранённый приоритет, по клику сохраняет значение.
                          */}
                            <span className="inline-flex items-center pt-[2px]">
                              <StarRating
                                value={form.priority}
                                onChange={readOnly ? undefined : (n) => set("priority", n)}
                              />
                            </span>
                          </Field>
                          <Field
                            label="Теги"
                            help="Метки клиента — видны на карточке в списке и на канбане"
                          >
                            <TagsField
                              all={allTags}
                              value={form.tag_ids}
                              onChange={(ids) => set("tag_ids", ids)}
                              canDelete={currentUser?.role === "admin"}
                            />
                          </Field>
                        </InnerGroup>
                      </div>

                      <div>
                        <InnerGroup title="Информация о клиенте">
                          <Field label="Контакт логиста/ЛПР" htmlFor="lead-contact">
                            <OdooInput
                              id="lead-contact"
                              placeholder="Фамилия Имя"
                              value={form.logist_contact}
                              disabled={readOnly}
                              onChange={(e) => set("logist_contact", e.target.value)}
                            />
                          </Field>
                          <Field label="Телефон логиста" htmlFor="lead-logist-phone">
                            <OdooInput
                              id="lead-logist-phone"
                              placeholder="+7 900 000-00-00"
                              value={form.logist_phone}
                              disabled={readOnly}
                              onChange={(e) => set("logist_phone", e.target.value)}
                            />
                          </Field>
                          <Field label="Email логиста" htmlFor="lead-email">
                            <OdooInput
                              id="lead-email"
                              type="email"
                              placeholder="name@example.ru"
                              value={form.logist_email}
                              disabled={readOnly}
                              onChange={(e) => set("logist_email", e.target.value)}
                            />
                          </Field>
                        </InnerGroup>
                      </div>
                    </FormGroup>

                    {!isNew && <Notebook tabs={notebookTabs} active={tab} onSelect={setTab} />}
                  </>
                )}
              </FormSheet>
            </div>
          </FormSheetBg>
        </main>
      </FormWorkspace>

      {transferOpen && lead && (
        <TransferDialog
          leadName={lead.name}
          leadIsLost={lead.is_archived}
          pending={transferLead.isPending}
          error={transferError}
          onCancel={() => setTransferOpen(false)}
          onConfirm={(userId) =>
            transferLead.mutate(userId, {
              onSuccess: () => {
                setTransferOpen(false);
                // Карточка больше не наша — возвращаемся на доску.
                navigate("/crm");
              },
              onError: (err: Error) => setTransferError(err.message || "Не удалось передать лид"),
            })
          }
        />
      )}

      {deleteOpen && lead && (
        <DeleteLeadDialog
          leadName={lead.name}
          pending={deleteLead.isPending}
          error={deleteError}
          onCancel={() => setDeleteOpen(false)}
          onConfirm={deleteForever}
        />
      )}

      {loseOpen && lead && (
        <LoseLeadDialog
          leadName={lead.name}
          pending={loseLead.isPending}
          error={loseError}
          onCancel={() => setLoseOpen(false)}
          onConfirm={confirmLose}
        />
      )}

      {quickCreateOpen && <QuickCreateLeadDialog onClose={() => setQuickCreateOpen(false)} />}

      {shipmentCreateOpen && lead && (
        <QuickCreateShipmentDialog leadId={lead.id} onClose={() => setShipmentCreateOpen(false)} />
      )}

      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </AppShell>
  );
}
