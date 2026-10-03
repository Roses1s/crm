import { CloudUpload, Undo2 } from "lucide-react";
import { useState, type InputHTMLAttributes, type ReactNode } from "react";

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

export function FormWorkspace({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  /*
   * Рабочая область карточки: форма и боковая лента имеют собственную
   * прокрутку. На узком экране лента переходит под форму с верхним разделителем.
   */
  return (
    <div className="flex min-h-0 w-full flex-col lg:h-[calc(100dvh-var(--odoo-record-control-panel-height))] lg:flex-row">
      {children}
      {aside && (
        <aside className="w-full shrink-0 border-t border-odoo-border bg-odoo-bg lg:w-[var(--odoo-record-aside-width)] lg:overflow-y-auto lg:border-l lg:border-t-0">
          {aside}
        </aside>
      )}
    </div>
  );
}

export function FormSheetBg({ children }: { children: ReactNode }) {
  // Фон тянется вместе с рабочей областью: предел в пикселях оставлял пустые поля
  // на широком экране, когда масштаб браузера был меньше 100%.
  return (
    <div className="w-full px-[var(--odoo-form-workspace-padding)] pb-[var(--odoo-form-workspace-padding)] pt-0">
      {children}
    </div>
  );
}

export function FormSheet({ children }: { children: ReactNode }) {
  // .o_form_sheet: белый лист, рамка 1px и компактные тематические отступы.
  return (
    <div className="rounded-[var(--odoo-form-sheet-radius)] border border-odoo-border bg-odoo-surface p-[var(--odoo-form-sheet-padding)] lg:p-[var(--odoo-form-sheet-padding-wide)]">
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
    warning: "border-odoo-warning/30 bg-odoo-warning/10 text-odoo-warning",
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

type StatusbarOverflowSide = "before" | "after";

type StatusbarItem = { id: number; name: string };

type StatusbarSegment = {
  key: string;
  item?: StatusbarItem;
  overflow?: StatusbarOverflowSide;
};

/**
 * Цепочка этапов в стиле Odoo: текущий этап остаётся видимым, а скрытые
 * предшествующие и следующие этапы открываются отдельными «…» по краям.
 */
export function FormStatusbar({
  items,
  current,
  onSelect,
  disabled = false,
  left,
  visibleCount = 5,
}: {
  items: StatusbarItem[];
  current?: number;
  onSelect: (id: number) => void;
  disabled?: boolean;
  left?: ReactNode;
  visibleCount?: number;
}) {
  const [moreOpen, setMoreOpen] = useState<StatusbarOverflowSide | null>(null);
  const count = Math.max(1, visibleCount);
  const visibleLength = Math.min(count, items.length);
  const currentIndex = Math.max(
    items.findIndex((item) => item.id === current),
    0,
  );
  const maxStart = Math.max(items.length - visibleLength, 0);
  const start = visibleLength
    ? Math.min(Math.max(currentIndex - Math.floor(visibleLength / 2), 0), maxStart)
    : 0;
  const before = items.slice(0, start);
  const visible = items.slice(start, start + visibleLength);
  const after = items.slice(start + visibleLength);
  const moreItems = moreOpen === "before" ? before : after;

  const segments: StatusbarSegment[] = [
    ...(before.length > 0 ? [{ key: "before", overflow: "before" as const }] : []),
    ...visible.map((item) => ({ key: `stage-${item.id}`, item })),
    ...(after.length > 0 ? [{ key: "after", overflow: "after" as const }] : []),
  ];

  return (
    <div className="sticky top-0 z-20 flex min-h-[40px] flex-wrap items-center justify-between gap-2 bg-odoo-bg px-4 py-1.5">
      <div className="flex flex-wrap items-center gap-1">{left}</div>
      <div className="relative flex min-w-0 flex-nowrap items-stretch justify-end overflow-x-auto py-px">
        {segments.map((segment, index) => {
          const isFirst = index === 0;
          const isLast = index === segments.length - 1;
          const single = segments.length === 1;
          const shape = isFirst ? "start" : isLast ? "end" : "middle";
          const active = segment.item?.id === current;
          const label = segment.item?.name ?? "…";
          const overflowSide = segment.overflow;
          const overflowLabel = overflowSide === "before" ? "Предыдущие этапы" : "Следующие этапы";

          return (
            <span
              key={segment.key}
              style={{
                height: STATUSBAR_HEIGHT,
                clipPath: single ? undefined : arrowClip(shape),
                marginLeft: isFirst ? 0 : -(ARROW_WIDTH - 2),
                backgroundColor: active
                  ? "rgb(var(--odoo-statusbar-current-border))"
                  : "rgb(var(--odoo-statusbar))",
                zIndex: active ? 1 : undefined,
              }}
              className="relative inline-flex shrink-0"
            >
              <button
                type="button"
                disabled={disabled}
                aria-current={active ? "step" : undefined}
                aria-label={overflowSide ? overflowLabel : undefined}
                onClick={() => {
                  if (overflowSide) {
                    setMoreOpen((side) => (side === overflowSide ? null : overflowSide));
                  } else if (segment.item) {
                    onSelect(segment.item.id);
                  }
                }}
                title={overflowSide ? overflowLabel : label}
                style={{
                  clipPath: single ? undefined : arrowClip(shape, 1),
                  backgroundColor: active
                    ? "rgb(var(--odoo-statusbar-current))"
                    : "rgb(var(--odoo-statusbar-segment))",
                  color: active
                    ? "rgb(var(--odoo-statusbar-current-text))"
                    : "rgb(var(--odoo-statusbar-text))",
                }}
                className={`max-w-[200px] truncate pr-4 text-[13px] transition-opacity hover:opacity-90 disabled:hover:opacity-100 ${
                  isFirst ? "pl-4" : "pl-5"
                } ${active ? "font-semibold" : "font-medium"}`}
              >
                {label}
              </button>
            </span>
          );
        })}

        {moreOpen && (
          <>
            <button
              type="button"
              className="fixed inset-0 z-10"
              aria-label="Закрыть"
              onClick={() => setMoreOpen(null)}
            />
            <div
              className={`absolute top-[38px] z-50 max-h-[260px] min-w-[220px] overflow-auto rounded-[3px] border border-odoo-border bg-odoo-surface py-1 shadow-lg ${
                moreOpen === "before" ? "left-0" : "right-0"
              }`}
            >
              {moreItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`block w-full px-3 py-1.5 text-left text-[13px] hover:bg-odoo-bg ${
                    item.id === current ? "font-semibold text-odoo-text" : "text-odoo-text"
                  }`}
                  onClick={() => {
                    setMoreOpen(null);
                    onSelect(item.id);
                  }}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** .o_group — две внутренние группы рядом. */
export function FormGroup({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-x-[var(--odoo-form-group-gap)] md:grid-cols-2">
      {children}
    </div>
  );
}

/** Плашка заголовка записи во всю ширину листа. */
export function FormTitle({ children }: { children: ReactNode }) {
  return (
    <div className="-mt-2 mb-4 rounded-[3px] bg-odoo-primary/12 px-0 py-1">
      <h1 className="text-[24px] font-normal leading-[34px] text-odoo-text">{children}</h1>
    </div>
  );
}

/** .o_inner_group — фиксированная колонка подписей, значения выровнены. */
export function InnerGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mb-[var(--odoo-form-section-gap)]">
      {title && (
        <h3 className="mb-3 border-b border-odoo-border pb-1.5 text-[12px] font-bold uppercase leading-[16px] tracking-[0.02em] text-odoo-text">
          {title}
        </h3>
      )}
      <div
        className="grid items-start gap-x-3 gap-y-[var(--odoo-form-field-gap)]"
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
        className={`pr-2 pt-[3px] text-[13px] font-medium leading-[19px] text-odoo-text-muted ${
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
      className={`w-full rounded-[3px] border border-transparent bg-transparent px-1 py-[2px] text-[13px] leading-[19px] text-odoo-text outline-none transition-colors placeholder:text-odoo-text-light hover:border-odoo-border focus:border-odoo-focus/40 ${className}`}
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

/** .o_form_status_indicator — иконки сохранить / отменить.
 *  Форма сохраняется сама через паузу в правках (см. вызывающую страницу) —
 *  эти кнопки на случай, если хочется сохранить сейчас же или откатить. */
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
        title={
          saving ? "Сохранение…" : "Сохранить сейчас (иначе сохранится само через пару секунд)"
        }
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
