import { useEffect, useRef, type ReactNode } from "react";

/**
 * Модальное окно как настоящий диалог (Ф-04 ревью 06.10).
 *
 * Что даёт семантика role="dialog" + aria-modal и зачем это здесь:
 * программа чтения с экрана объявляет заголовок окна и не даёт «уйти»
 * читать страницу под ним, Esc закрывает окно, Tab не выпускает фокус
 * за его пределы, а после закрытия фокус возвращается на кнопку, которая
 * окно открыла. Раньше все окна были просто «дивами поверх страницы» —
 * для мыши неотличимо, для клавиатуры и скринридера — ловушка.
 *
 * Клик по затемнению намеренно НЕ закрывает окно: у подтверждений это
 * случайный клик, у форм — потеря введённого. Закрытие — кнопкой или Esc.
 */

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

export function Modal({
  label,
  onClose,
  children,
  panelClassName = "w-full max-w-md",
  zClassName = "z-50",
}: {
  /** Название окна для скринридера (произносится при открытии). */
  label: string;
  onClose: () => void;
  children: ReactNode;
  panelClassName?: string;
  zClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    // Куда вернуть фокус, когда окно закроется.
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Фокус — на первый интерактивный элемент (или на саму панель): без
    // этого Esc и Tab работали бы на кнопке, открывшей окно, а не внутри.
    const initial = panel.querySelector<HTMLElement>(FOCUSABLE);
    (initial ?? panel).focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreTo?.focus();
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 ${zClassName} flex items-center justify-center bg-odoo-overlay/30 p-4`}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className={`rounded-lg bg-odoo-surface p-4 shadow-lg outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  );
}
