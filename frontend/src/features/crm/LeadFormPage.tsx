import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker, useNavigate, useParams } from "react-router-dom";

import { AppShell } from "@/app/layout/AppShell";
import { StarRating } from "@/features/crm/board/StarRating";
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
  useAccountants,
  useCreateLead,
  useCustomersByInn,
  useDeleteLead,
  useLead,
  useLeadPager,
  useLeadShipments,
  useMe,
  useRestoreLead,
  useStages,
  useTags,
  useUpdateLead,
} from "@/shared/api/hooks";
import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import type { Attachment } from "@/shared/types";
import { ClientGroup } from "@/features/crm/lead-form/ClientGroup";
import { CompanyGroup } from "@/features/crm/lead-form/CompanyGroup";
import { describe } from "@/features/crm/lead-form/describe-error";
import { DeleteLeadDialog } from "@/features/crm/lead-form/DeleteLeadDialog";
import { LeadChatter } from "@/features/crm/lead-form/LeadChatter";
import { LeadHeaderBar } from "@/features/crm/lead-form/LeadHeaderBar";
import { LeadStageBar } from "@/features/crm/lead-form/LeadStageBar";
import { LoseLeadAction } from "@/features/crm/lead-form/LoseLeadAction";
import { QuickCreateLeadDialog } from "@/features/crm/lead-form/QuickCreateLeadDialog";
import { QuickCreateShipmentDialog } from "@/features/shipments/QuickCreateShipmentDialog";
import { LostRibbon } from "@/features/crm/lead-form/LostRibbon";
import { ShipmentsTab } from "@/features/crm/lead-form/ShipmentsTab";
import { TransferLeadAction } from "@/features/crm/lead-form/TransferLeadAction";
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
  // Ключ по id: переход «предыдущий / следующий лид» пересоздаёт форму,
  // чтобы правки одной карточки не переехали в соседнюю.
  return <LeadForm key={id ?? "new"} id={id} />;
}

function LeadForm({ id }: { id?: string }) {
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const toast = useToast();
  // Номер лида известен сразу из адреса, поэтому заявки и вложения
  // запрашиваем параллельно с самим лидом, а не вторым заходом после его
  // ответа.
  const savedId = isNew ? undefined : id;

  const { data: currentUser } = useMe();
  const { data: accountants = [] } = useAccountants();
  const { data: lead, isLoading, refetch: refetchLead } = useLead(id);
  const { data: stages = [] } = useStages();
  const { data: allTags = [] } = useTags();
  const { data: shipments = [] } = useLeadShipments(savedId);
  const { data: pager } = useLeadPager(id);

  const createLead = useCreateLead();
  const updateLead = useUpdateLead(id);
  const restoreLead = useRestoreLead();
  const deleteLead = useDeleteLead();

  const [form, setForm] = useState<FormState>(empty);
  const [pristine, setPristine] = useState<FormState>(empty);
  const [updatedAt, setUpdatedAt] = useState<string>();
  const [leadConflict, setLeadConflict] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("shipments");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  // Передача лида коллеге: страница хранит только признак открытого окна,
  // а запрос и текст ошибки живут в самом действии (TransferLeadAction).
  const [transferOpen, setTransferOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  // Отметка проигрышем: окно с выбором причины; запрос и ошибка живут в
  // самом действии (LoseLeadAction).
  const [loseOpen, setLoseOpen] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  // Кнопка «Новый» в шапке карточки открывает ту же простую форму, что
  // и на доске: второй реализации быстрого создания не держим.
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  // Кнопка «Создать заявку» открывает простую форму вместо полного
  // бланка заявки: полную карточку дозаполнят позже.
  const [shipmentCreateOpen, setShipmentCreateOpen] = useState(false);
  const loadedId = useRef<number | null>(null);
  // После неудачной попытки автосохранение выключается и включается
  // снова только от новой правки руками. Иначе форма оставалась
  // «грязной», и неудачный запрос повторялся каждые 3 секунды, пока
  // открыта вкладка.
  const autoSaveBlocked = useRef(false);
  const bypassNextNavigation = useRef(false);
  const proceedAfterSave = useRef(false);

  // Предупреждение о дубле ИНН не блокирует сохранение. Проверяем и при
  // создании, и при редактировании; собственный лид исключён через
  // exclude_id — иначе карточка «находила бы дубль самой себя».
  const { data: sameInn = [] } = useCustomersByInn(form.inn.trim(), lead?.id);

  // Загруженную карточку кладём в форму один раз: фоновое обновление
  // данных не должно затирать несохранённые правки пользователя.
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

  // У новой карточки этап по умолчанию — первый в воронке владельца.
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

  // Уход со страницы с несохранёнными правками предупреждаем стандартным
  // диалогом браузера (beforeunload).
  useEffect(() => {
    if (!dirty || lead?.is_archived) return;
    const handler = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, lead?.is_archived]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    if (lead?.is_archived || leadConflict) return;
    // Правка руками снимает запрет автосохранения: прошлая попытка могла
    // упасть именно из-за значения, которое сейчас исправляют.
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

  // Автосохранение: через 3 секунды без правок сохраняем сами. Кнопка в
  // шапке остаётся — для спокойствия и ради сохранения сразу, не
  // дожидаясь таймера. Ещё не созданную карточку автосохранение не
  // трогает: её создаёт только пользователь явным сохранением.
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

  // Смена этапа у сохранённой карточки уходит на сервер сразу, без
  // кнопки сохранения, — как в Odoo.
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
  // Проигранный лид — только для чтения, пока его явно не восстановят:
  // правки и вложения в этом состоянии запрещены.
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

  const chatter = savedId ? (
    <LeadChatter
      leadId={savedId}
      authorInitials={composerInitial}
      currentUserId={currentUser?.id}
      readOnly={readOnly}
      onPreview={setPreview}
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
        Пара «форма + лента» занимает всю доступную ширину. Предел в
        пикселях давал заметные поля по бокам при масштабе браузера
        меньше 100%. Долевая ширина ленты живёт в FormWorkspace, чтобы
        карточки лида и заявки выглядели одинаково.
      */}
      <FormWorkspace aside={chatter}>
        <main className="min-w-0 flex-1 lg:overflow-y-auto">
          {/*
            Кнопки действий и лента этапов вынесены на отдельную панель
            над листом карточки — как в Odoo 17, где статусбар и кнопки
            живут в панели управления, а не на самом листе.
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
                              {accountants.map(({ id: accountantId, name }) => (
                                <option key={accountantId} value={name}>
                                  {name}
                                </option>
                              ))}
                              {form.accountant_name &&
                                !accountants.some(({ name }) => name === form.accountant_name) && (
                                  <option value={form.accountant_name} disabled>
                                    {form.accountant_name} (не активен)
                                  </option>
                                )}
                            </select>
                          </Field>
                          <Field label="Приоритет">
                            {/*
                            Тот же виджет звёзд, что и на канбане: при
                            наведении подсвечивает звёзды до курсора, при
                            уходе возвращает сохранённый приоритет, по
                            клику сохраняет значение.
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
            // Карточка больше не наша — возвращаемся на доску.
            // Предупреждение о несохранённых правках не обходим: это
            // прежний путь передачи лида.
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
