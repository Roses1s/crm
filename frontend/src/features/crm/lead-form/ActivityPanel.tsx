import { format } from "date-fns";
import { ru } from "date-fns/locale";
import { CalendarClock, Check, Mail, Phone, Trash2, Users } from "lucide-react";
import { useState } from "react";

import {
  useCompleteActivity,
  useCreateActivity,
  useDeleteActivity,
  useLeadActivities,
} from "@/shared/api/hooks";
import type { ActivityState, ActivityType } from "@/shared/types";

const TYPE_ICONS: Record<ActivityType, typeof Phone> = {
  call: Phone,
  meeting: Users,
  todo: CalendarClock,
  email: Mail,
};

const TYPE_LABELS: Record<ActivityType, string> = {
  call: "Звонок",
  meeting: "Встреча",
  todo: "Задача",
  email: "Письмо",
};

/** Цвет срока: просрочено — красный, сегодня — оранжевый, дальше — обычный. */
export const STATE_TEXT: Record<ActivityState, string> = {
  overdue: "text-odoo-danger",
  today: "text-odoo-warning",
  planned: "text-odoo-success",
  done: "text-odoo-text-muted",
};

function dueLabel(due: string, state: ActivityState): string {
  const date = new Date(due);
  const human = Number.isNaN(date.getTime()) ? due : format(date, "d MMMM", { locale: ru });
  if (state === "overdue") return `Просрочено — ${human}`;
  if (state === "today") return "Сегодня";
  return human;
}

/**
 * Блок активностей в карточке лида: список запланированного и форма
 * «Запланировать действие». Живёт над чаттером — как в Odoo.
 */
export function ActivityPanel({ leadId }: { leadId: number | undefined }) {
  const { data: activities = [] } = useLeadActivities(leadId);
  const create = useCreateActivity(leadId);
  const complete = useCompleteActivity(leadId);
  const remove = useDeleteActivity(leadId);

  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ActivityType>("call");
  const [summary, setSummary] = useState("");
  const [dueDate, setDueDate] = useState(() => new Date().toISOString().slice(0, 10));

  function submit() {
    if (!summary.trim()) return;
    create.mutate(
      { type, summary: summary.trim(), due_date: dueDate },
      {
        onSuccess: () => {
          setSummary("");
          setOpen(false);
        },
      },
    );
  }

  return (
    <div className="border-b border-odoo-border-light px-3 py-2">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-odoo-text-muted">
          Действия {activities.length > 0 && `(${activities.length})`}
        </h4>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="text-[12px] text-odoo-action hover:underline"
        >
          {open ? "Отмена" : "Запланировать"}
        </button>
      </div>

      {open && (
        <form
          className="mt-2 space-y-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex gap-1.5">
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ActivityType)}
              className="h-7 rounded-[4px] border border-odoo-border bg-odoo-surface px-1.5 text-[13px]"
            >
              {Object.entries(TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-7 rounded-[4px] border border-odoo-border bg-odoo-surface px-1.5 text-[13px]"
            />
          </div>
          <input
            autoFocus
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Что нужно сделать"
            className="h-7 w-full rounded-[4px] border border-odoo-border px-2 text-[13px] outline-none placeholder:text-odoo-text-light focus:border-odoo-primary"
          />
          <button
            type="submit"
            disabled={create.isPending || !summary.trim()}
            className="h-7 rounded-[4px] bg-odoo-primary px-3 text-[13px] font-medium text-white transition-colors hover:bg-odoo-primary-hover disabled:opacity-50"
          >
            {create.isPending ? "Сохранение…" : "Запланировать"}
          </button>
        </form>
      )}

      {activities.length === 0 ? (
        !open && <p className="mt-1 text-[12px] text-odoo-text-light">Действий не запланировано</p>
      ) : (
        <ul className="mt-2 space-y-1">
          {activities.map((activity) => {
            const Icon = TYPE_ICONS[activity.type] ?? CalendarClock;
            return (
              <li key={activity.id} className="flex items-start gap-2 text-[13px]">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${STATE_TEXT[activity.state]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-odoo-text" title={activity.summary}>
                    {activity.summary}
                  </span>
                  <span className={`text-[11px] ${STATE_TEXT[activity.state]}`}>
                    {TYPE_LABELS[activity.type]} · {dueLabel(activity.due_date, activity.state)}
                    {activity.assigned_to_name ? ` · ${activity.assigned_to_name}` : ""}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label="Отметить выполненным"
                  title="Выполнено"
                  disabled={complete.isPending}
                  onClick={() => complete.mutate(activity.id)}
                  className="shrink-0 rounded-sm p-0.5 text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-success"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Удалить действие"
                  title="Удалить"
                  onClick={() => remove.mutate(activity.id)}
                  className="shrink-0 rounded-sm p-0.5 text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
