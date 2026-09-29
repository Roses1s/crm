import { ChevronLeft, ChevronRight, FileText, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { TagsField } from "@/features/crm/lead-form/TagsField";
import { empty, normalized, toForm, toPayload, type FormState } from "@/features/crm/lead-form/form-state";
import { ApiError } from "@/shared/api/client";
import {
  useAddNote,
  useArchiveLead,
  useCanManage,
  useCreateLead,
  useLead,
  useLeadPager,
  useLeadShipments,
  useLeadTimeline,
  useStages,
  useTags,
  useUpdateLead,
} from "@/shared/api/hooks";
import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import { Chatter } from "@/shared/ui/chatter";
import {
  Field,
  FormAlert,
  FormGroup,
  FormSheet,
  FormSheetBg,
  FormStatusIndicator,
  FormStatusbar,
  FormTitle,
  InnerGroup,
  Notebook,
  OdooInput,
} from "@/shared/ui/odoo-form";
import { FormSkeleton } from "@/shared/ui/skeleton";

export function LeadFormPage() {
  const { id } = useParams();
  // key по id: переход «предыдущий / следующий лид» пересоздаёт форму.
  return <LeadForm key={id ?? "new"} id={id} />;
}

function LeadForm({ id }: { id?: string }) {
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const canManage = useCanManage();

  const { data: lead, isLoading } = useLead(id);
  const { data: stages = [] } = useStages();
  const { data: allTags = [] } = useTags();
  const { data: timeline = [] } = useLeadTimeline(id);
  const { data: shipments = [] } = useLeadShipments(lead?.id);
  const { data: pager } = useLeadPager(id);

  const createLead = useCreateLead();
  const updateLead = useUpdateLead(id);
  const archiveLead = useArchiveLead();
  const addNote = useAddNote(id);

  const [form, setForm] = useState<FormState>(empty);
  const [pristine, setPristine] = useState<FormState>(empty);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("shipments");
  const [actionsOpen, setActionsOpen] = useState(false);
  const loadedId = useRef<number | null>(null);

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
    setForm((f) => ({ ...f, [key]: value }));
  }

  function describe(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      if (err.status === 422) return "Проверьте поля: ИНН должен быть из 10 или 12 цифр с верной контрольной суммой";
      if (err.status === 403) return "Недостаточно прав для этого действия";
      return err.message;
    }
    return fallback;
  }

  function save() {
    setError("");
    if (!form.name.trim()) {
      setError("Укажите название лида");
      return;
    }
    const payload = toPayload(form);

    if (isNew) {
      createLead.mutate(payload, {
        onSuccess: (created) => navigate(`/crm/leads/${created.id}`, { replace: true }),
        onError: (err) => setError(describe(err, "Не удалось создать лид")),
      });
    } else {
      updateLead.mutate(payload, {
        onSuccess: (updated) => {
          const next = toForm(updated);
          setForm(next);
          setPristine(next);
        },
        onError: (err) => setError(describe(err, "Не удалось сохранить")),
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

  function archive() {
    if (!lead) return;
    if (!window.confirm(`Пометить лид «${lead.name}» проигранным? Он уйдёт в архив.`)) return;
    archiveLead.mutate(lead.id, {
      onSuccess: () => navigate("/crm"),
      onError: (err) => setError(describe(err, "Не удалось архивировать лид")),
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

  const notebookTabs = [
    {
      id: "shipments",
      label: `Заявки (${shipments.length})`,
      content: (
        <div className="-mx-4 lg:-mx-6">
          <table className="w-full border-collapse text-[13px] [font-variant-numeric:tabular-nums]">
            <thead>
              <tr>
                <th className="w-[80px] bg-odoo-bg px-2 py-1.5 pl-4 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))] lg:pl-6">
                  №
                </th>
                <th className="bg-odoo-bg px-2 py-1.5 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))]">
                  Маршрут
                </th>
                <th className="w-[180px] bg-odoo-bg px-2 py-1.5 pr-4 text-left font-medium text-odoo-text shadow-[inset_0_-1px_0_rgb(var(--odoo-border))] lg:pr-6">
                  Статус
                </th>
              </tr>
            </thead>
            <tbody>
              {shipments.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-odoo-text-muted lg:px-6">
                    Пока нет заявок по этому лиду.
                  </td>
                </tr>
              )}
              {shipments.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-odoo-border-light hover:bg-odoo-surface-hover"
                >
                  <td className="px-2 py-1 pl-4 lg:pl-6">
                    <Link className="text-odoo-action hover:underline" to={`/shipments/${s.id}`}>
                      {s.id}
                    </Link>
                  </td>
                  <td className="truncate px-2 py-1" title={s.route}>
                    {s.route}
                  </td>
                  <td className="truncate px-2 py-1 pr-4 lg:pr-6">{s.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 pt-2 lg:px-6">
            <Link
              to={`/shipments/new?lead=${lead?.id ?? ""}`}
              className="text-[13px] text-odoo-action hover:underline"
            >
              Добавить заявку
            </Link>
          </div>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <ControlPanel
        onNew={() => navigate("/crm/leads/new")}
        crumbs={[{ label: "Лиды", to: "/crm" }, { label: form.name || "Новый лид" }]}
        status={
          <FormStatusIndicator dirty={dirty} saving={saving} onSave={save} onDiscard={discard} />
        }
        cog={
          !isNew && canManage ? (
            <span className="relative inline-flex">
              <button
                type="button"
                aria-label="Действия"
                title="Действия"
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-odoo-text-muted transition-colors hover:bg-odoo-bg hover:text-odoo-text"
                onClick={() => setActionsOpen((v) => !v)}
              >
                <Settings className="h-3.5 w-3.5" />
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
                    <button
                      type="button"
                      disabled={archiveLead.isPending}
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-odoo-text hover:bg-odoo-bg disabled:opacity-60"
                      onClick={() => {
                        setActionsOpen(false);
                        archive();
                      }}
                    >
                      Архивировать
                    </button>
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
            <span className="mr-1 flex items-center gap-1">
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

      <div className="flex min-h-0 flex-col lg:h-[calc(100dvh-90px)] lg:flex-row">
        <div className="min-w-0 flex-1 lg:overflow-y-auto">
          <FormSheetBg>
            {error && <FormAlert>{error}</FormAlert>}

            <FormSheet>
              <FormStatusbar
                items={stages}
                current={form.stage_id}
                disabled={saving}
                onSelect={selectStage}
                left={
                  !isNew ? (
                    <>
                      <Link
                        to={`/shipments/new?lead=${lead?.id ?? ""}`}
                        className="inline-flex h-[30px] items-center rounded-[4px] bg-odoo-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-odoo-primary-hover"
                      >
                        Создать заявку
                      </Link>
                      {canManage && (
                        <button
                          type="button"
                          disabled={archiveLead.isPending}
                          onClick={archive}
                          className="h-[30px] rounded-[4px] border border-odoo-border bg-odoo-surface px-3 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg disabled:opacity-60"
                        >
                          Проигрыш
                        </button>
                      )}
                    </>
                  ) : null
                }
              />

              {isLoading ? (
                <FormSkeleton />
              ) : (
                <>
                  <FormTitle>
                    <OdooInput
                      aria-label="Название лида"
                      placeholder="например, ООО «Ромашка»"
                      className="!px-1 !text-[24px] !leading-[34px]"
                      value={form.name}
                      onChange={(e) => set("name", e.target.value)}
                    />
                  </FormTitle>

                  <FormGroup>
                    <div>
                      <InnerGroup title="Реквизиты">
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
                            onChange={(e) => set("inn", e.target.value)}
                          />
                        </Field>
                        <Field label="КПП" htmlFor="lead-kpp">
                          <OdooInput
                            id="lead-kpp"
                            inputMode="numeric"
                            maxLength={9}
                            placeholder="9 цифр"
                            className="max-w-[14ch]"
                            value={form.kpp}
                            onChange={(e) => set("kpp", e.target.value)}
                          />
                        </Field>
                        <Field label="Часовой пояс" htmlFor="lead-tz">
                          <OdooInput
                            id="lead-tz"
                            placeholder="МСК+2"
                            className="max-w-[14ch]"
                            value={form.timezone}
                            onChange={(e) => set("timezone", e.target.value)}
                          />
                        </Field>
                        <Field label="Продавец">
                          {owner ? (
                            <span className="flex items-center gap-1.5 pt-[2px]">
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-odoo-primary text-[9px] font-semibold text-white">
                                {ownerAvatar}
                              </span>
                              <span className="truncate" title={lead?.assigned_to_email ?? owner}>
                                {owner}
                              </span>
                            </span>
                          ) : (
                            <span className="pt-[2px] text-odoo-text-light">Не назначен</span>
                          )}
                        </Field>
                      </InnerGroup>

                      <InnerGroup>
                        <Field label="Лимит" htmlFor="lead-limit">
                          <span className="flex items-baseline gap-1">
                            <OdooInput
                              id="lead-limit"
                              type="number"
                              className="max-w-[11ch] text-right"
                              value={form.credit_limit}
                              onChange={(e) => set("credit_limit", e.target.value)}
                            />
                            <span className="text-odoo-text-muted">₽</span>
                          </span>
                        </Field>
                        <Field label="Дата первого звонка" htmlFor="lead-first-call">
                          <OdooInput
                            id="lead-first-call"
                            type="date"
                            className="max-w-[18ch]"
                            value={form.first_call_date}
                            onChange={(e) => set("first_call_date", e.target.value)}
                          />
                        </Field>
                        <Field label="Дата следующего звонка" htmlFor="lead-next-call">
                          <OdooInput
                            id="lead-next-call"
                            type="date"
                            className="max-w-[18ch]"
                            value={form.next_call_date}
                            onChange={(e) => set("next_call_date", e.target.value)}
                          />
                        </Field>
                      </InnerGroup>
                    </div>

                    <div>
                      <InnerGroup>
                        <Field label="Email" htmlFor="lead-company-email">
                          <OdooInput
                            id="lead-company-email"
                            type="email"
                            placeholder="info@example.ru"
                            value={form.company_email}
                            onChange={(e) => set("company_email", e.target.value)}
                          />
                        </Field>
                        <Field label="Телефон" htmlFor="lead-phone">
                          <OdooInput
                            id="lead-phone"
                            placeholder="+7 351 000-00-00"
                            value={form.phone}
                            onChange={(e) => set("phone", e.target.value)}
                          />
                        </Field>
                        <Field label="Приоритет">
                          <span className="inline-flex items-center pt-[2px] text-[16px] leading-none text-odoo-warning">
                            {[1, 2, 3].map((n) => (
                              <button
                                key={n}
                                type="button"
                                className="px-px"
                                aria-label={`Приоритет ${n}`}
                                onClick={() => set("priority", form.priority === n ? 0 : n)}
                              >
                                {form.priority >= n ? "★" : "☆"}
                              </button>
                            ))}
                          </span>
                        </Field>
                        <Field label="Теги" help="Метки для фильтрации лидов в списке и канбане">
                          <TagsField
                            all={allTags}
                            value={form.tag_ids}
                            onChange={(ids) => set("tag_ids", ids)}
                          />
                        </Field>
                      </InnerGroup>

                      <InnerGroup title="Информация о клиенте">
                        <Field label="Контакт логиста/ЛПР" htmlFor="lead-contact">
                          <OdooInput
                            id="lead-contact"
                            placeholder="Фамилия Имя"
                            value={form.logist_contact}
                            onChange={(e) => set("logist_contact", e.target.value)}
                          />
                        </Field>
                        <Field label="Телефон логиста" htmlFor="lead-logist-phone">
                          <OdooInput
                            id="lead-logist-phone"
                            placeholder="+7 900 000-00-00"
                            value={form.logist_phone}
                            onChange={(e) => set("logist_phone", e.target.value)}
                          />
                        </Field>
                        <Field label="Email логиста" htmlFor="lead-email">
                          <OdooInput
                            id="lead-email"
                            type="email"
                            placeholder="name@example.ru"
                            value={form.logist_email}
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
          </FormSheetBg>
        </div>

        {!isNew && (
          <div className="w-full shrink-0 bg-odoo-surface lg:w-[33%] lg:max-w-[520px] lg:overflow-y-auto">
            <Chatter
              timeline={timeline}
              onSubmit={(body) => addNote.mutate(body)}
              posting={addNote.isPending}
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}
