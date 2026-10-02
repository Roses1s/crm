import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";

import { queryClient } from "@/shared/api/query-client";
import { ToastProvider } from "@/shared/ui/toast";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>{children}</ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
