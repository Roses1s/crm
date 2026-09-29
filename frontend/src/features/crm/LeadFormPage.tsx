import { ChevronLeft, ChevronRight, FileText, Settings } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { AppShell, ControlPanel } from "@/app/layout/AppShell";
import { TagsField } from "@/features/crm/lead-form/TagsField";
import { ownerInitials, ownerLabel } from "@/shared/lib/owner";
import { activeLeads, leadById } from "@/shared/mock/leads";
import { shipmentsByLead } from "@/shared/mock/shipments";
import { stages } from "@/shared/mock/stages";
import { tags as allTags } from "@/shared/mock/tags";
import { attachments, timeline } from "@/shared/mock/timeline";
import { Chatter } from "@/shared/ui/chatter";
import {
  Field,
  FormGroup,
  FormSheet,
  FormSheetBg,
  FormStatusbar,
  FormTitle,
  InnerGroup,
  Notebook,
  OdooInput,
} from "@/shared/ui/odoo-form";

/**
 * Карточка лида.
 *
 * Вёрстка полностью повторяет исходную: статусбар этапов, плашка заголовка,
 * две группы полей, вкладка «Заявки» и чаттер справа. Сохранения, валидации
 * ИНН, архивации и загрузки вложений нет — поля просто редактируемые.
 */
export function LeadFormPage() {
  const { id } = useParams();
  // key по id: при переходе «предыдущий / следующий лид» компонент
  // пересоздаётся, поэтому поля и выбранный этап берутся из новой записи.
  return <LeadForm key={id ?? "new"} id={id} />;
}

function LeadForm({ id }: { id?: string }) {
  const isNew = id === "new" || !id;
  const navigate = useNavigate();
  const lead = isNew ? null : leadById(id);

  const [stage, setStage] = useState(lead?.stage ?? stages[0].id);
  const [priority, setPriority] = useState(lead?.priority ?? 0);
  const [tab, setTab] = useState("shipments");
  const [actionsOpen, setActionsOpen] = useState(false);

  const shipments = lead ? shipmentsByLead(lead.id) : [];
  const owner = lead ? ownerLabel(lead) : "";
  const ownerAvatar = lead ? ownerInitials(lead) : "—";

  // Пейджер «N / M» с соседними записями — как в панели управления Odoo.
  const index = lead ? activeLeads.findIndex((l) => l.id === lead.id) : -1;
  const prevId = index > 0 ? activeLeads[index - 1].id : null;
  const nextId = index >= 0 && index < activeLeads.length - 1 ? activeLeads[index + 1].id : null;

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
        crumbs={[{ label: "Лиды", to: "/crm" }, { label: lead?.name || "Новый лид" }]}
        cog={
          !isNew ? (
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
                      className="block w-full px-3 py-1.5 text-left text-[13px] text-odoo-text hover:bg-odoo-bg"
                      onClick={() => setActionsOpen(false)}
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
          !isNew && index >= 0 ? (
            <span className="mr-1 flex items-center gap-1">
              <span className="whitespace-nowrap text-[13px] text-odoo-text-muted [font-variant-numeric:tabular-nums]">
                {index + 1} / {activeLeads.length}
              </span>
              <span className="inline-flex h-7 overflow-hidden rounded-[4px] border border-odoo-border bg-odoo-surface">
                <button
                  type="button"
                  aria-label="Предыдущий лид"
                  disabled={!prevId}
                  onClick={() => prevId && navigate(`/crm/leads/${prevId}`)}
                  className="inline-flex w-7 items-center justify-center text-odoo-text-muted transition-colors hover:bg-odoo-bg disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Следующий лид"
                  disabled={!nextId}
                  onClick={() => nextId && navigate(`/crm/leads/${nextId}`)}
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
            <FormSheet>
              <FormStatusbar
                items={stages}
                current={stage}
                onSelect={setStage}
                left={
                  !isNew ? (
                    <>
                      <Link
                        to={`/shipments/new?lead=${lead?.id ?? ""}`}
                        className="inline-flex h-[30px] items-center rounded-[4px] bg-odoo-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-odoo-primary-hover"
                      >
                        Создать заявку
                      </Link>
                      <button
                        type="button"
                        className="h-[30px] rounded-[4px] border border-odoo-border bg-odoo-surface px-3 text-[13px] text-odoo-text transition-colors hover:bg-odoo-bg"
                      >
                        Проигрыш
                      </button>
                    </>
                  ) : null
                }
              />

              <div key={lead?.id ?? "new"}>
                <FormTitle>
                  <OdooInput
                    aria-label="Название лида"
                    placeholder="например, ООО «Ромашка» — 7451234567"
                    className="!px-1 !text-[24px] !leading-[34px]"
                    defaultValue={lead?.name ?? ""}
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
                          defaultValue={lead?.inn ?? ""}
                        />
                      </Field>
                      <Field label="КПП" htmlFor="lead-kpp">
                        <OdooInput
                          id="lead-kpp"
                          inputMode="numeric"
                          maxLength={9}
                          placeholder="9 цифр"
                          className="max-w-[14ch]"
                          defaultValue={lead?.kpp ?? ""}
                        />
                      </Field>
                      <Field label="Часовой пояс" htmlFor="lead-tz">
                        <OdooInput
                          id="lead-tz"
                          placeholder="МСК+2"
                          className="max-w-[14ch]"
                          defaultValue={lead?.timezone ?? ""}
                        />
                      </Field>
                      <Field label="Продавец">
                        {owner ? (
                          <span className="flex items-center gap-1.5 pt-[2px]">
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-odoo-primary text-[9px] font-semibold text-white">
                              {ownerAvatar}
                            </span>
                            <span className="truncate" title={lead?.assigned_to_email || owner}>
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
                            defaultValue={lead?.credit_limit ?? "0"}
                          />
                          <span className="text-odoo-text-muted">₽</span>
                        </span>
                      </Field>
                      <Field label="Дата первого звонка" htmlFor="lead-first-call">
                        <OdooInput
                          id="lead-first-call"
                          type="date"
                          className="max-w-[18ch]"
                          defaultValue={lead?.first_call_date ?? ""}
                        />
                      </Field>
                      <Field label="Дата следующего звонка" htmlFor="lead-next-call">
                        <OdooInput
                          id="lead-next-call"
                          type="date"
                          className="max-w-[18ch]"
                          defaultValue={lead?.next_call_date ?? ""}
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
                          defaultValue={lead?.company_email ?? ""}
                        />
                      </Field>
                      <Field label="Телефон" htmlFor="lead-phone">
                        <OdooInput
                          id="lead-phone"
                          placeholder="+7 351 000-00-00, +7 …"
                          defaultValue={lead?.phone ?? ""}
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
                              onClick={() => setPriority(priority === n ? 0 : n)}
                            >
                              {priority >= n ? "★" : "☆"}
                            </button>
                          ))}
                        </span>
                      </Field>
                      <Field label="Теги" help="Метки для фильтрации лидов в списке и канбане">
                        <TagsField all={allTags} initial={(lead?.tags ?? []).map((t) => t.id)} />
                      </Field>
                    </InnerGroup>

                    <InnerGroup title="Информация о клиенте">
                      <Field label="Контакт логиста/ЛПР" htmlFor="lead-contact">
                        <OdooInput
                          id="lead-contact"
                          placeholder="Фамилия Имя"
                          defaultValue={lead?.logist_contact ?? ""}
                        />
                      </Field>
                      <Field label="Телефон логиста" htmlFor="lead-logist-phone">
                        <OdooInput
                          id="lead-logist-phone"
                          placeholder="+7 900 000-00-00"
                          defaultValue={lead?.logist_phone ?? ""}
                        />
                      </Field>
                      <Field label="Email логиста" htmlFor="lead-email">
                        <OdooInput
                          id="lead-email"
                          type="email"
                          placeholder="name@example.ru"
                          defaultValue={lead?.logist_email ?? ""}
                        />
                      </Field>
                    </InnerGroup>
                  </div>
                </FormGroup>

                {!isNew && <Notebook tabs={notebookTabs} active={tab} onSelect={setTab} />}
              </div>
            </FormSheet>
          </FormSheetBg>
        </div>

        {!isNew && (
          <div className="w-full shrink-0 bg-odoo-surface lg:w-[33%] lg:max-w-[520px] lg:overflow-y-auto">
            <Chatter timeline={timeline} attachments={attachments} />
          </div>
        )}
      </div>
    </AppShell>
  );
}
