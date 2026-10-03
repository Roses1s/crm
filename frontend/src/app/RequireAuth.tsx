import { type ReactNode, useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";

import {
  isRestored,
  markRestored,
  refreshSession,
  useIsAuthenticated,
  useSessionRestored,
} from "@/shared/api/auth";

/**
 * Защита маршрутов.
 *
 * Токен доступа живёт в памяти вкладки, поэтому после перезагрузки страницы
 * его нет. Прежде чем уводить человека на вход, один раз пробуем восстановить
 * сессию по куке HttpOnly — иначе каждое обновление F5 выбрасывало бы из CRM.
 * Проверку прав делает бэкенд, фронтенд лишь не показывает пустые экраны.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const authenticated = useIsAuthenticated();
  const restored = useSessionRestored();
  const location = useLocation();

  useEffect(() => {
    if (isRestored() || authenticated) return;
    void refreshSession().finally(() => markRestored());
  }, [authenticated]);

  if (!authenticated && !restored) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-odoo-text-muted">
        Загрузка…
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
