import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useIsAuthenticated } from "@/shared/api/auth";

/**
 * Простая защита маршрутов: нет токена — уводим на страницу входа.
 * Проверку прав делает бэкенд, фронтенд лишь не показывает пустые экраны.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  const location = useLocation();

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
