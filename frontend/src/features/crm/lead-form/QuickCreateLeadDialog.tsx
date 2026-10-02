import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { ApiError } from "@/shared/api/client";
import { useCreateLead, useCustomersByInn, useStages } from "@/shared/api/hooks";

const inputCls =
  "w-full rounded-[4px] border border-odoo-border bg-odoo-surface px-2 py-1.5 text-[13px] text-odoo-text placeholder:text-odoo-text-light outline-none transition-colors hover:border-odoo-border focus:border-odoo-focus";
const labelCls = "mb-1 block text-[12px] font-medium text-odoo-text";

const emptyForm = { name: "", inn: "", logist_contact: "", logist_phone: "" };
type QuickForm = typeof emptyForm;

/**
 * Быстрое создание лида по кнопке «Новый» — четыре обязательных поля вместо
 * полной карточки. Продавцом бэкенд сам ставит того, кто создаёт (см.
 * `services.leads.create_lead`), поле на форме не показываем. Этап — первый
 * на СВОЕЙ доске создателя: лид всегда появляется у автора, даже если
 * администратор в этот момент смотрит чужую доску.
 */
export function QuickCreateLeadDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { data: stages = [] } = useStages();
  const createLead = useCreateLead();
  const [form, setForm] = useState<QuickForm>(emptyForm);
  const [error, setError] = useState("");

  // Предупреждение о дубле ИНН: не блокирует создание, только предупреждает,
  // если лид с таким ИНН уже есть — своя раскладка видимости, как в «Клиентах»
  // (чужой активный лид отдаётся урезанным — название, ИНН, ответственный).
  const { data: sameInn = [] } = useCustomersByInn(form.inn.trim());

  function set<K extends keyof QuickForm>(key: K, value: QuickForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function describe(err: unknown): string {
    if (err instanceof ApiError) {
      if (err.status === 422)
        return "Проверьте ИНН: нужно 10 или 12 цифр с верной контрольной суммой";
      return err.message;
    }
    return "Не удалось создать лид";
  }

  function submit() {
    setError("");
    if (
      !form.name.trim() ||
      !form.inn.trim() ||
      !form.logist_contact.trim() ||
      !form.logist_phone.trim()
    ) {
      setError("Заполните все поля — они обязательны");
      return;
    }
    if (!stages[0]) {
      setError("На вашей доске нет ни одного этапа — сначала создайте этап");
      return;
    }
    createLead.mutate(
      {
        name: form.name.trim(),
        inn: form.inn.trim(),
        logist_contact: form.logist_contact.trim(),
        logist_phone: form.logist_phone.trim(),
        stage_id: stages[0].id,
      },
      {
        onSuccess: (created) => navigate(`/crm/leads/${created.id}`),
        onError: (err) => setError(describe(err)),
      },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-odoo-overlay/30 p-4">
      <form
        className="w-full max-w-md rounded-lg bg-odoo-surface p-4 shadow-lg"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <h3 className="text-[15px] font-semibold text-odoo-text">Новый лид</h3>
        <p className="mt-1 text-[13px] text-odoo-text-muted">
          Остальное — теги, приоритет, email, заявки — можно добавить на карточке сразу после
          создания.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          <label>
            <span className={labelCls}>Название компании</span>
            <input
              autoFocus
              required
              className={inputCls}
              placeholder="например, ООО «Ромашка»"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </label>
          <label>
            <span className={labelCls}>ИНН</span>
            <input
              required
              inputMode="numeric"
              className={inputCls}
              placeholder="10 или 12 цифр"
              value={form.inn}
              onChange={(e) => set("inn", e.target.value)}
            />
          </label>

          {sameInn.length > 0 && (
            <p
              role="alert"
              className="rounded-[4px] bg-odoo-tag-yellow-bg px-2.5 py-2 text-[12px] leading-5 text-odoo-tag-yellow-text"
            >
              Лид с таким ИНН уже есть: «{sameInn[0].name}»
              {sameInn[0].assigned_to_name ? `, ответственный — ${sameInn[0].assigned_to_name}` : ""}
              . Можно продолжить — это просто предупреждение.
            </p>
          )}

          <label>
            <span className={labelCls}>Контакт логиста</span>
            <input
              required
              className={inputCls}
              placeholder="Фамилия Имя"
              value={form.logist_contact}
              onChange={(e) => set("logist_contact", e.target.value)}
            />
          </label>
          <label>
            <span className={labelCls}>Телефон логиста</span>
            <input
              required
              className={inputCls}
              placeholder="+7 900 000-00-00"
              value={form.logist_phone}
              onChange={(e) => set("logist_phone", e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-[13px] text-odoo-danger">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-8 rounded-[4px] border border-odoo-border px-3 text-sm text-odoo-text hover:bg-odoo-bg"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={createLead.isPending}
            className="h-8 rounded-[4px] bg-odoo-primary px-3 text-sm font-medium text-white transition-colors hover:bg-odoo-primary-hover disabled:opacity-60"
          >
            {createLead.isPending ? "Создаём…" : "Создать"}
          </button>
        </div>
      </form>
    </div>
  );
}
