import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/app/layout/AppShell";
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
  useMe,
  useRestoreLead,
  useStages,
  useTags,
  useUpdateLead,
  useUploadAttachment,
} from "@/shared/api/hooks";
import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import type { Attachment } from "@/shared/types";
import { ClientGroup } from "@/features/crm/lead-form/ClientGroup";
import { CompanyGroup } from "@/features/crm/lead-form/CompanyGroup";
import { describe } from "@/features/crm/lead-form/describe-error";
import { DeleteLeadDialog } from "@/features/crm/lead-form/DeleteLeadDialog";
import { LeadHeaderBar } from "@/features/crm/lead-form/LeadHeaderBar";
import { LeadStageBar } from "@/features/crm/lead-form/LeadStageBar";
import { LoseLeadAction } from "@/features/crm/lead-form/LoseLeadAction";
import { QuickCreateLeadDialog } from "@/features/crm/lead-form/QuickCreateLeadDialog";
import { QuickCreateShipmentDialog } from "@/features/shipments/QuickCreateShipmentDialog";
import { LostRibbon } from "@/features/crm/lead-form/LostRibbon";
import { ShipmentsTab } from "@/features/crm/lead-form/ShipmentsTab";
import { TransferLeadAction } from "@/features/crm/lead-form/TransferLeadAction";
import { Chatter } from "@/shared/ui/chatter";
import { FilePreview } from "@/shared/ui/file-preview";
import { UnsavedChangesDialog } from "@/shared/ui/unsaved-changes-dialog";
import {
  Field,
  FormAlert,
  FormGroup,
  FormSheet,
  FormWorkspace,
  FormSheetBg,
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
  const { data: lead, isLoading, refetch: refetchLead } = useLead(id);
  const { data: stages = [] } = useStages();
  const { data: allTags = [] } = useTags();
  const { data: timeline = [] } = useLeadTimeline(id);
  const { data: shipments = [] } = useLeadShipments(savedId);
  const { data: pager } = useLeadPager(id);
  const { data: attachments = [] } = useLeadAttachments(savedId);

  const createLead = useCreateLead();
  const updateLead = useUpdateLead(id);
  const restoreLead = useRestoreLead();
  const deleteLead = useDeleteLead();
  const addNote = useAddNote(id);
  const editNote = useEditNote(id);
  const deleteTimelineEntry = useDeleteTimelineEntry(id);
  const uploadAttachment = useUploadAttachment(savedId);
  const deleteAttachment = useDeleteAttachment(savedId);

  const [form, setForm] = useState<FormState>(empty);
  const [pristine, setPristine] = useState<FormState>(empty);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [leadConflict, setLeadConflict] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("shipments");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  // Передача лида коллеге: страница помнит только, открыто ли окно —
  // запрос и текст ошибки живут в действии.
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Отметить проигрышем: окно с выбором причины; запрос и ошибка живут в действии.
  const [loseOpen, setLoseOpen] = useState(false);
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
  const bypassNextNavigation = useRef(false);
  const proceedAfterSave = useRef(false);

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
      setUpdatedAt(lead.updated_at);
      setLeadConflict(false);
    }
  }, [lead]);

  // У новой карточки этап по умолчанию — первый в воронке.
  useEffect(() => {
    if (isNew && stages.length && !form.stage_id) {
      setForm((f) => ({ ...f, stage_id: stages[0].id }));
      setPristine((p) => ({ ...p, stage_id: stages[0].id }));
    }
  }, [isNew, stages, form.stage_id]);

  const dirty = normalized(form) !== normalized(pristine);
  const saving = createLead.isPending || updateLead.isPending;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => {
    if (bypassNextNavigation.current) {
      bypassNextNavigation.current = false;
      return false;
    }
    const locationChanges =
      currentLocation.pathname !== nextLocation.pathname ||
      currentLocation.search !== nextLocation.search;
    return (
      (dirty || saving) &&
      locationChanges &&
      nextLocation.pathname !== "/login" &&
      !lead?.is_archived
    );
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
    if (!saving) save({ manual: true });
  }

  // Предупреждение браузера при уходе со страницы с несохранёнными правками.
  useEffect(() => {
    if (!dirty || lead?.is_archived) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, lead?.is_archived]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (lead?.is_archived || leadConflict) return;
    // Правка руками снимает запрет автосохранения: прошлая попытка могла
    // упасть именно из-за того, что сейчас исправляют.
    autoSaveBlocked.current = false;
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function reloadLatestLead() {
    const result = await refetchLead();
    if (result.isError || !result.data) {
      setError(
        "Не удалось загрузить актуальную карточку. Проверьте соединение и попробуйте снова.",
      );
      return;
    }
    const next = toForm(result.data);
    setForm(next);
    setPristine(next);
    setUpdatedAt(result.data.updated_at);
    setLeadConflict(false);
    autoSaveBlocked.current = false;
    setError("");
  }

  function save(options: { manual?: boolean } = {}) {
    if (saving || leadConflict || (!isNew && lead?.is_archived)) return;
    if (options.manual) autoSaveBlocked.current = false;
    setError("");
    if (!form.name.trim()) {
      setError("Укажите название лида");
      return;
    }
    const payload = toPayload(form);

    if (isNew) {
      createLead.mutate(payload, {
        onSuccess: (created) => {
          if (proceedAfterSavedTransition()) return;
          navigateWithoutPrompt(`/crm/leads/${created.id}`, { replace: true });
        },
        onError: (err) => {
          proceedAfterSave.current = false;
          autoSaveBlocked.current = true;
          setError(describe(err, "Не удалось создать лид"));
        },
      });
    } else {
      if (!updatedAt) {
        autoSaveBlocked.current = true;
        setError("Не удалось проверить версию карточки. Обновите страницу и попробуйте снова.");
        return;
      }
      updateLead.mutate(
        { ...payload, expected_updated_at: updatedAt },
        {
          onSuccess: (updated) => {
            const next = toForm(updated);
            setForm(next);
            setPristine(next);
            setUpdatedAt(updated.updated_at);
            toast.show("Сохранено");
            proceedAfterSavedTransition();
          },
          onError: (err) => {
            proceedAfterSave.current = false;
            autoSaveBlocked.current = true;
            if (err instanceof ApiError && err.code === "lead_conflict") setLeadConflict(true);
            setError(describe(err, "Не удалось сохранить"));
          },
        },
      );
    }
  }

  function discard() {
    setError("");
    if (isNew) {
      navigateWithoutPrompt("/crm");
      return;
    }
    setForm(pristine);
  }

  // Автосохранение: через 3с без правок сохраняем сами, кнопка в хедере
  // остаётся — для спокойствия и чтобы сохранить можно было сразу, не ждя.
  // Новую (ещё не созданную) карточку не трогаем — её создаёт только сам
  // пользователь явным сохранением.
  useEffect(() => {
    if (isNew || !dirty || saving || autoSaveBlocked.current || lead?.is_archived) return;
    const timer = setTimeout(() => save(), 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, dirty, saving, form, lead?.is_archived]);

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
      onSuccess: () => navigateWithoutPrompt("/crm"),
      onError: (err) => setDeleteError(describe(err, "Не удалось удалить лид")),
    });
  }

  // Смена этапа у сохранённой карточки уходит на сервер сразу — как в Odoo.
  function selectStage(stageId: number) {
    if (lead?.is_archived || leadConflict || updateLead.isPending || stageId === form.stage_id)
      return;
    set("stage_id", stageId);
    if (isNew) return;
    if (!updatedAt) {
      set("stage_id", pristine.stage_id);
      setError("Не удалось проверить версию карточки. Обновите страницу и попробуйте снова.");
      return;
    }
    updateLead.mutate(
      { stage_id: stageId, expected_updated_at: updatedAt },
      {
        onSuccess: (updated) => {
          setUpdatedAt(updated.updated_at);
          setPristine((p) => ({ ...p, stage_id: updated.stage_id }));
        },
        onError: (err) => {
          set("stage_id", pristine.stage_id);
          if (err instanceof ApiError && err.code === "lead_conflict") setLeadConflict(true);
          setError(describe(err, "Не удалось изменить этап"));
        },
      },
    );
  }

  const owner = lead ? ownerLabel(lead) : "";
  const ownerAvatar = lead ? ownerInitials(lead) : "—";
  const isOwner = !!lead && !!currentUser && lead.assigned_to_id === currentUser.id;
  // Любой проигранный лид остаётся только для чтения — до явного восстановления.
  const readOnly = !!lead?.is_archived || leadConflict;
  const composerInitial = (currentUser?.first_name || currentUser?.email || "Я")
    .slice(0, 1)
    .toUpperCase();

  const notebookTabs = [
    {
      id: "shipments",
      label: `Заявки (${shipments.length})`,
      content: (
        <ShipmentsTab shipments={shipments} onAddShipment={() => setShipmentCreateOpen(true)} />
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
      readOnly={readOnly}
    />
  ) : undefined;

  return (
    <AppShell>
      <LeadHeaderBar
        leadName={form.name}
        isNew={isNew}
        isArchived={!!lead?.is_archived}
        isAdmin={currentUser?.role === "admin"}
        dirty={dirty}
        readOnly={readOnly}
        saving={saving}
        actionsOpen={actionsOpen}
        deletePending={deleteLead.isPending}
        shipmentsCount={shipments.length}
        pager={pager ?? null}
        onNew={() => setQuickCreateOpen(true)}
        onSave={() => save({ manual: true })}
        onDiscard={discard}
        onActionsOpenChange={setActionsOpen}
        onOpenLose={() => {
          setActionsOpen(false);
          setLoseOpen(true);
        }}
        onOpenDelete={() => {
          setActionsOpen(false);
          setDeleteError("");
          setDeleteOpen(true);
        }}
        onPrevLead={() => pager?.prev_id && navigate(`/crm/leads/${pager.prev_id}`)}
        onNextLead={() => pager?.next_id && navigate(`/crm/leads/${pager.next_id}`)}
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
          <LeadStageBar
            stages={stages}
            currentStageId={form.stage_id}
            isNew={isNew}
            isArchived={!!lead?.is_archived}
            isOwner={isOwner}
            saving={saving}
            readOnly={readOnly}
            restorePending={restoreLead.isPending}
            restoreError={restoreError}
            onSelectStage={selectStage}
            onCreateShipment={() => setShipmentCreateOpen(true)}
            onRestore={restore}
            onLose={() => setLoseOpen(true)}
          />

          <FormSheetBg>
            {error && (
              <FormAlert>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>{error}</span>
                  {leadConflict && (
                    <button
                      type="button"
                      onClick={() => void reloadLatestLead()}
                      className="rounded-[4px] border border-current px-2 py-1 font-medium hover:bg-odoo-danger/10"
                    >
                      Загрузить актуальную карточку
                    </button>
                  )}
                </div>
              </FormAlert>
            )}
            {lead?.is_archived && (
              <FormAlert tone="warning">
                Лид проигран. Чтобы менять его данные, сначала восстановите карточку.
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
                        <CompanyGroup
                          name={form.name}
                          inn={form.inn}
                          sameInn={sameInn}
                          owner={owner}
                          ownerAvatar={ownerAvatar}
                          isNew={isNew}
                          readOnly={readOnly}
                          isAdmin={currentUser?.role === "admin"}
                          isArchived={!!lead?.is_archived}
                          lossReasonName={lead?.loss_reason_name ?? null}
                          onNameChange={(v) => set("name", v)}
                          onInnChange={(v) => set("inn", v)}
                          onOpenTransfer={() => setTransferOpen(true)}
                        />

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
                              disabled={readOnly}
                            />
                          </Field>
                        </InnerGroup>
                      </div>

                      <ClientGroup
                        logistContact={form.logist_contact}
                        logistPhone={form.logist_phone}
                        logistEmail={form.logist_email}
                        readOnly={readOnly}
                        onLogistContactChange={(v) => set("logist_contact", v)}
                        onLogistPhoneChange={(v) => set("logist_phone", v)}
                        onLogistEmailChange={(v) => set("logist_email", v)}
                      />
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
        <TransferLeadAction
          leadId={lead.id}
          leadName={lead.name}
          leadIsLost={lead.is_archived}
          onCancel={() => setTransferOpen(false)}
          onTransferred={() => {
            setTransferOpen(false);
            // Карточка больше не наша — возвращаемся на доску. Предупреждение
            // о несохранённых правках не обходим: это прежний путь передачи.
            navigate("/crm");
          }}
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
        <LoseLeadAction
          leadId={lead.id}
          leadName={lead.name}
          onCancel={() => setLoseOpen(false)}
          onLosed={() => {
            setLoseOpen(false);
            navigateWithoutPrompt("/crm");
          }}
        />
      )}

      {quickCreateOpen && <QuickCreateLeadDialog onClose={() => setQuickCreateOpen(false)} />}

      {shipmentCreateOpen && lead && (
        <QuickCreateShipmentDialog leadId={lead.id} onClose={() => setShipmentCreateOpen(false)} />
      )}

      {blocker.state === "blocked" && (
        <UnsavedChangesDialog
          saving={saving}
          canSave={!leadConflict && !lead?.is_archived && (!isNew || Boolean(form.name.trim()))}
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
