import { Check } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { ToastContext } from "@/shared/ui/toast-context";

interface ToastItem {
  id: number;
  message: string;
}

const AUTO_DISMISS_MS = 2500;

/** Глобальные уведомления об успешном сохранении — подключается один раз
 *  в корне приложения (см. `app/providers.tsx`), вызывается через `useToast()`
 *  из любой формы, и при ручном сохранении, и при автосохранении. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const show = useCallback((message: string) => {
    const id = nextId.current++;
    setItems((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 rounded-[4px] bg-odoo-tag-green-bg px-3 py-2 text-[13px] font-medium text-odoo-tag-green-text shadow-lg [animation:toast-in_0.18s_ease-out]"
          >
            <Check className="h-4 w-4" />
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
