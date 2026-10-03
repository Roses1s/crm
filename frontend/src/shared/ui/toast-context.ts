import { createContext, useContext } from "react";

interface ToastContextValue {
  /** Показать зелёную плашку в углу экрана; исчезает сама через 2.5 сек. */
  show: (message: string) => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast должен вызываться внутри ToastProvider");
  return ctx;
}
