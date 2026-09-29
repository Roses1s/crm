// Форма карточки лида отделена от разметки: здесь видно, какие поля есть,
// как выглядит пустая карточка и что считается изменением.
import type { Lead } from "@/shared/types";
import type { LeadPayload } from "@/shared/api/hooks";

export const empty = {
  name: "",
  inn: "",
  kpp: "",
  timezone: "",
  company_email: "",
  phone: "",
  logist_email: "",
  logist_contact: "",
  logist_phone: "",
  credit_limit: "0",
  first_call_date: "",
  next_call_date: "",
  priority: 0,
  stage_id: 0,
  tag_ids: [] as number[],
};

export type FormState = typeof empty;

export function toForm(lead: Lead): FormState {
  return {
    name: lead.name,
    inn: lead.inn,
    kpp: lead.kpp || "",
    timezone: lead.timezone || "",
    company_email: lead.company_email || "",
    phone: lead.phone || "",
    logist_email: lead.logist_email || "",
    logist_contact: lead.logist_contact || "",
    logist_phone: lead.logist_phone || "",
    credit_limit: String(lead.credit_limit ?? "0"),
    first_call_date: lead.first_call_date || "",
    next_call_date: lead.next_call_date || "",
    priority: lead.priority,
    stage_id: lead.stage_id,
    tag_ids: lead.tags?.map((t) => t.id) ?? [],
  };
}

/** Сравниваем состояния по нормализованному виду: порядок тегов не важен. */
export function normalized(state: FormState): string {
  return JSON.stringify({ ...state, tag_ids: [...state.tag_ids].sort((a, b) => a - b) });
}

/** Пустые строки превращаем в null — бэкенд ждёт именно так. */
export function toPayload(state: FormState): LeadPayload {
  return {
    name: state.name.trim(),
    inn: state.inn.trim(),
    kpp: state.kpp,
    timezone: state.timezone,
    company_email: state.company_email || null,
    phone: state.phone,
    logist_contact: state.logist_contact,
    logist_phone: state.logist_phone,
    logist_email: state.logist_email || null,
    credit_limit: state.credit_limit || "0",
    first_call_date: state.first_call_date || null,
    next_call_date: state.next_call_date || null,
    priority: state.priority,
    stage_id: state.stage_id,
    tag_ids: state.tag_ids,
  };
}
