import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useIsAuthenticated } from "@/shared/api/auth";
import { ApiError } from "@/shared/api/client";
import { useLogin } from "@/shared/api/hooks";
import { Button } from "@/shared/ui/button";

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const authenticated = useIsAuthenticated();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (authenticated) return <Navigate to="/" replace />;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    login.mutate(
      { email, password },
      {
        onSuccess: () => navigate(location.state?.from ?? "/", { replace: true }),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 429) {
            setError("Слишком много попыток входа. Подождите минуту.");
          } else if (err instanceof ApiError && err.status >= 500) {
            setError("Сервер недоступен. Попробуйте позже.");
          } else {
            setError("Неверный email или пароль");
          }
        },
      },
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-odoo-dark">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-odoo-dark-light bg-white p-6 shadow-lg"
      >
        <div className="mb-5 text-center">
          <div className="text-lg font-bold text-odoo-primary">Detroid</div>
          <h1 className="mt-1 text-[15px] font-semibold text-odoo-text">Вход в CRM</h1>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium uppercase text-odoo-text-muted">
            Email
          </span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[4px] border border-odoo-border px-2.5 py-1.5 text-sm focus:border-odoo-primary focus:outline-none focus:ring-1 focus:ring-odoo-primary"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium uppercase text-odoo-text-muted">
            Пароль
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-[4px] border border-odoo-border px-2.5 py-1.5 text-sm focus:border-odoo-primary focus:outline-none focus:ring-1 focus:ring-odoo-primary"
          />
        </label>
        {error && <p className="mb-3 text-sm text-odoo-danger">{error}</p>}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? "Вход…" : "Войти"}
        </Button>
      </form>
    </div>
  );
}
