import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";

const queryClient = new QueryClient({
  // Единая точка логирования ошибок запросов: любую неуспешную загрузку данных
  // видно в консоли браузера, а не только в том месте, где она случилась.
  queryCache: new QueryCache({
    onError: (error) => {
      console.error("Ошибка запроса к серверу:", error);
    },
  }),
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>{children}</BrowserRouter>
    </QueryClientProvider>
  );
}
