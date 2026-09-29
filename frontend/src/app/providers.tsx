import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";

/**
 * Макет-заглушка: никаких клиентов данных здесь нет.
 * На следующем этапе сюда вернётся QueryClientProvider (TanStack Query).
 */
export function Providers({ children }: { children: ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}
