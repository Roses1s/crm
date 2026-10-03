import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@/app/ErrorBoundary";
import { Providers } from "@/app/providers";
import { AppRouter } from "@/app/router";
import "@/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <Providers>
        <AppRouter />
      </Providers>
    </ErrorBoundary>
  </StrictMode>,
);
