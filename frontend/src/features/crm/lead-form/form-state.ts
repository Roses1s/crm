// Состояние формы карточки лида отделено от разметки: здесь видно, какие
// поля есть, как выглядит пустая карточка и что считается изменением.
import type { Lead } from "@/shared/types";
import type { LeadPayload } from "@/shared/api/hooks";

export const empty = {
  name: "",
  inn: "",
  logist_email: "",
  accountant_name: "",
  logist_contact: "",
  logist_phone: "",
  priority: 0,
  stage_id: 0,
  tag_ids: [] as number[],
};

export type FormState = typeof empty;

export function toForm(lead: Lead): FormState {
  return {
    name: lead.name,
    inn: lead.inn,
    logist_email: lead.logist_email || "",
    accountant_name: lead.accountant_name || "",
    logist_contact: lead.logist_contact || "",
    logist_phone: lead.logist_phone || "",
    priority: lead.priority,
    stage_id: lead.stage_id,
    tag_ids: lead.tags?.map((t) => t.id) ?? [],
  };
}

/** Состояния сравниваем по нормализованному виду: порядок тегов
 *  значения не имеет. */
export function normalized(state: FormState): string {
  return JSON.stringify({
    ...state,
    tag_ids: [...state.tag_ids].sort((a, b) => a - b),
  });
}

/** Пустые строки превращаем в null: бэкенд ждёт именно такой вид. */
export function toPayload(state: FormState): LeadPayload {
  return {
    name: state.name.trim(),
    inn: state.inn.trim(),
    logist_contact: state.logist_contact,
    logist_phone: state.logist_phone,
    logist_email: state.logist_email || null,
    accountant_name: state.accountant_name || null,
    priority: state.priority,
    stage_id: state.stage_id,
    tag_ids: state.tag_ids,
  };
}
