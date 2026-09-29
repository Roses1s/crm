import { CloudUpload, Undo2 } from "lucide-react";
import {
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";

/**
 * Примитивы формы в стиле Odoo 17.
 *
 * Значения взяты из официальных исходников 17.0:
 * - addons/web/static/src/views/form/form_controller.scss
 * - addons/web/static/src/views/form/form.variables.scss
 * - addons/web/static/src/views/fields/statusbar/statusbar_field.scss
 * - addons/web/static/src/core/notebook/notebook.scss
 * - addons/web/static/src/scss/primary_variables.scss
 */

const STATUSBAR_HEIGHT = 33; // $o-statusbar-height
const ARROW_WIDTH = 11; // $o-statusbar-arrow-width

export function FormSheetBg({ children }: { children: ReactNode }) {
  // .o_form_sheet_bg: padding-top 8px, padding-x 16px, max-width 1534px, выравнивание по левому краю
  return <div className="w-full max-w-[1534px] px-4 pb-4 pt-2">{children}</div>;
}

export function FormSheet({ children }: { children: ReactNode }) {
  // .o_form_sheet: белый лист, рамка 1px, радиус 4px, отступ 16px (24px на lg)
  return (
    <div className="rounded-[4px] border border-odoo-border bg-odoo-surface p-4 lg:p-6">
      {children}
    </div>
  );
}

export function FormAlert({
  tone = "danger",
  children,
}: {
  tone?: "danger" | "warning";
  children: ReactNode;
}) {
  const tones = {
    danger: "border-odoo-danger/30 bg-odoo-danger/10 text-odoo-danger",
    warning: "border-amber-300 bg-amber-50 text-amber-800",
  };
  return (
    <div role="alert" className={`mb-2 rounded-[4px] border px-3 py-2 text-[13px] ${tones[tone]}`}>
      {children}
    </div>
  );
}

function arrowClip(shape: "start" | "middle" | "end", inset = 0) {
  const tip = ARROW_WIDTH;
  const i = inset;
  if (shape === "start") {
    return `polygon(${i}px ${i}px, calc(100% - ${tip}px) ${i}px, calc(100% - ${i}px) 50%, calc(100% - ${tip}px) calc(100% - ${i}px), ${i}px calc(100% - ${i}px))`;
  }
  if (shape === "end") {
    return `polygon(${i}px ${i}px, calc(100% - ${i}px) ${i}px, calc(100% - ${i}px) calc(100% - ${i}px), ${i}px calc(100% - ${i}px), ${tip + i}px 50%)`;
  }
  return `polygon(${i}px ${i}px, calc(100% - ${tip}px) ${i}px, calc(100% - ${i}px) 50%, calc(100% - ${tip}px) calc(100% - ${i}px), ${i}px calc(100% - ${i}px), ${tip + i}px 50%)`;
}

/**
 * o_field_statusbar — стрелки этапов справа, текущий выделен цветом действия.
 * Не поместившиеся этапы сворачиваются в «…».
 */
export function FormStatusbar({
  items,
  current,
  onSelect,
  disabled = false,
  left,
  visibleCount = 5,
}: {
  items: { id: number; name: string }[];
  current?: number;
  onSelect: (id: number) => void;
  disabled?: boolean;
  left?: ReactNode;
  visibleCount?: number;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  let visible = items.slice(0, visibleCount);
  let hidden = items.slice(visibleCount);
  const currentHidden = hidden.find((s) => s.id === current);
  if (currentHidden && visible.length > 0) {
    // Odoo всегда держит текущий этап видимым.
    const dropped = visible[visible.length - 1];
    visible = [...visible.slice(0, -1), currentHidden];
    hidden = hidden.filter((s) => s.id !== currentHidden.id).concat(dropped);
    hidden.sort((a, b) => items.indexOf(a) - items.indexOf(b));
  }

  return (
    <div className="-mx-4 -mt-4 mb-4 flex min-h-[41px] flex-wrap items-center justify-between gap-2 border-b border-odoo-border px-4 py-1 lg:-mx-6 lg:-mt-6 lg:px-6">
      <div className="flex flex-wrap items-center gap-1">{left}</div>
      <div className="relative flex min-w-0 flex-wrap items-stretch justify-end">
        {visible.map((item, i) => {
          const isFirst = i === 0;
          const isLast = i === visible.length - 1 && hidden.length === 0;
          const shape = isFirst ? "start" : isLast ? "end" : "middle";
          const active = item.id === current;
          const single = visible.length === 1 && hidden.length === 0;
          return (
            <span
              key={item.id}
              style={{
                height: STATUSBAR_HEIGHT,
                clipPath: single ? undefined : arrowClip(shape),
                marginLeft: isFirst ? 0 : -(ARROW_WIDTH - 2),
                backgroundColor: active
                  ? "rgb(var(--odoo-secondary))"
                  : "rgb(var(--odoo-statusbar))",
              }}
              className="relative inline-flex"
            >
              <button
                type="button"
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(item.id)}
                title={item.name}
                style={{ clipPath: single ? undefined : arrowClip(shape, 1) }}
                className={`max-w-[200px] truncate bg-odoo-surface text-[13px] transition-colors disabled:cursor-wait ${
                  isFirst ? "pl-4" : "pl-5"
                } pr-4 ${
                  active
                    ? "font-semibold text-odoo-text"
                    : "font-medium text-odoo-statusbar-text hover:bg-odoo-bg"
                }`}
              >
                {item.name}
              </button>
            </span>
          );
        })}

        {hidden.length > 0 && (
          <>
            <span
              style={{
                height: STATUSBAR_HEIGHT,
                clipPath: arrowClip("end"),
                marginLeft: -(ARROW_WIDTH - 2),
                backgroundColor: "rgb(var(--odoo-statusbar))",
              }}
              className="relative inline-flex"
            >
              <button
                type="button"
                disabled={disabled}
                title="Другие этапы"
                aria-label="Другие этапы"
                onClick={() => setMoreOpen((v) => !v)}
                style={{ clipPath: arrowClip("end", 1) }}
                className="bg-odoo-surface pl-5 pr-4 text-[13px] font-medium text-odoo-statusbar-text transition-colors hover:bg-odoo-bg"
              >
                …
              </button>
            </span>
            {moreOpen && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-10"
                  aria-label="Закрыть"
                  onClick={() => setMoreOpen(false)}
                />
                <div className="absolute right-0 top-[38px] z-50 max-h-[260px] min-w-[220px] overflow-auto rounded-[3px] border border-odoo-border bg-odoo-surface py-1 shadow-lg">
                  {hidden.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-odoo-bg ${
                        item.id === current ? "font-semibold text-odoo-text" : "text-odoo-text"
                      }`}
                      onClick={() => {
                        setMoreOpen(false);
                        onSelect(item.id);
                      }}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** .o_group — две внутренние группы рядом. */
export function FormGroup({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">{children}</div>;
}

/** Плашка заголовка записи во всю ширину листа. */
export function FormTitle({ children }: { children: ReactNode }) {
  return (
    <div className="mb-4 rounded-[2px] bg-odoo-title-band px-3 py-1.5">
      <h1 className="text-[24px] font-normal leading-[34px] text-odoo-text">{children}</h1>
    </div>
  );
}

/** .o_inner_group — фиксированная колонка подписей, значения выровнены. */
export function InnerGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-7">
      {title && (
        <h3 className="mb-3 text-[12px] font-bold uppercase leading-[16px] tracking-[0.02em] text-odoo-text">
          {title}
        </h3>
      )}
      <div
        className="grid items-start gap-x-3 gap-y-[10px]"
        style={{ gridTemplateColumns: "140px minmax(0, 1fr)" }}
      >
        {children}
      </div>
    </div>
  );
}

/** .o_form_label + ячейка поля. Должен быть прямым потомком InnerGroup. */
export function Field({
  label,
  htmlFor,
  help,
  children,
  muted = false,
}: {
  label: string;
  htmlFor?: string;
  help?: string;
  children: ReactNode;
  muted?: boolean;
}) {
  return (
    <>
      <label
        htmlFor={htmlFor}
        className={`pr-2 pt-[3px] text-[13px] font-normal leading-[19px] text-odoo-text ${
          muted ? "opacity-[0.66]" : ""
        }`}
      >
        {label}
        {help && (
          <sup
            title={help}
            aria-hidden="true"
            className="ml-0.5 cursor-help text-[10px] text-odoo-text-light"
          >
            ?
          </sup>
        )}
      </label>
      <div className="min-w-0 text-[13px] leading-[19px] text-odoo-text">{children}</div>
    </>
  );
}

/** .o_input — рамка появляется только при наведении и фокусе. */
export function OdooInput({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-[3px] border border-transparent bg-transparent px-1 py-[2px] text-[13px] leading-[19px] text-odoo-text outline-none transition-colors placeholder:text-odoo-text-light hover:border-odoo-border focus:border-odoo-primary ${className}`}
    />
  );
}

/** Многострочный o_input (текстовое поле Odoo). */
export function OdooTextarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full resize-y rounded-[3px] border border-transparent bg-transparent px-1 py-[2px] text-[13px] leading-[19px] text-odoo-text outline-none transition-colors placeholder:text-odoo-text-light hover:border-odoo-border focus:border-odoo-primary ${className}`}
    />
  );
}

/** Булев виджет Odoo. */
export function OdooCheckbox({
  checked,
  onChange,
  id,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  id?: string;
  label?: string;
}) {
  return (
    <input
      id={id}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-[3px] h-[14px] w-[14px] cursor-pointer accent-odoo-primary"
    />
  );
}

/** .o_notebook — вкладки в бутстрап-стиле, как в Odoo. */
export function Notebook({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: string; label: string; content: ReactNode }[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div className="mt-2.5">
      <div className="-mx-4 overflow-x-auto lg:-mx-6">
        <div className="flex border-b border-odoo-border bg-odoo-surface px-4 lg:px-6">
          {tabs.map((tab) => {
            const on = tab.id === current?.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onSelect(tab.id)}
                className={`-mb-px mr-[-1px] rounded-t-[4px] border px-4 py-2 text-[13px] transition-colors ${
                  on
                    ? "border-odoo-border border-b-odoo-surface bg-odoo-surface font-medium text-odoo-text"
                    : "border-transparent text-odoo-text-muted hover:border-odoo-border-light"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="border-b border-odoo-border py-4">{current?.content}</div>
    </div>
  );
}

/** .o_form_status_indicator — иконки сохранить / отменить. */
export function FormStatusIndicator({
  dirty,
  saving,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  if (!dirty) return null;
  return (
    <span className="flex items-center gap-0.5" aria-label="Несохранённые изменения">
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        title="Сохранить вручную"
        aria-label="Сохранить"
        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text disabled:cursor-wait disabled:opacity-60"
      >
        <CloudUpload className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onDiscard}
        disabled={saving}
        title="Отменить изменения"
        aria-label="Отменить изменения"
        className="inline-flex h-6 w-6 items-center justify-center rounded-sm text-odoo-text-muted hover:bg-odoo-bg hover:text-odoo-text disabled:opacity-60"
      >
        <Undo2 className="h-4 w-4" />
      </button>
    </span>
  );
}
