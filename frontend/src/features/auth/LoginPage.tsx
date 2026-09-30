import { Eye, EyeOff, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useIsAuthenticated } from "@/shared/api/auth";
import { ApiError } from "@/shared/api/client";
import { useLogin } from "@/shared/api/hooks";

/**
 * Экран входа.
 *
 * Оформлен отдельно от рабочей плотной сетки CRM, но использует те же
 * семантические роли цвета, поэтому контраст сохраняется в обеих темах.
 */
export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };
  const authenticated = useIsAuthenticated();
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const fieldCls =
    "h-10 w-full rounded-lg border border-odoo-border bg-odoo-surface px-3 text-[14px] text-odoo-text " +
    "placeholder:text-odoo-text-light transition-colors hover:border-odoo-border focus:border-odoo-focus focus:outline-none " +
    "focus:ring-2 focus:ring-odoo-focus/20";
  const labelCls = "mb-1 block text-[12.5px] font-medium text-odoo-text-soft";

  return (
    <div className="login-screen flex min-h-screen flex-col bg-odoo-bg">
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[360px] rounded-xl border border-odoo-border-light bg-odoo-surface px-5 py-7 shadow-lg sm:px-7">
          <div className="flex flex-col items-center text-center">
            {/* Логотип компании; alt пустой — рядом идёт текстовое название. */}
            <img src="/logo.svg" alt="" className="h-14 w-14" />
            <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-odoo-text">
              CRM Детроид
            </h1>
            <p className="mt-1 text-[13px] text-odoo-text-muted">Вход в систему</p>
          </div>

          <form onSubmit={onSubmit} className="mt-7">
            <label className="block">
              <span className={labelCls}>Email</span>
              <input
                type="email"
                required
                autoFocus
                autoComplete="username"
                placeholder="name@crmdetroid.ru"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldCls}
              />
            </label>

            <label className="mt-4 block">
              <span className={labelCls}>Пароль</span>
              <div className="relative">
                <input
                  // Тип меняется кнопкой «глаз»: на телефоне пароль набирают
                  // вслепую и часто ошибаются.
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${fieldCls} pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                  className="absolute right-0.5 top-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md text-odoo-text-light transition-colors hover:bg-odoo-surface-sunken hover:text-odoo-text"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg border border-odoo-danger/30 bg-odoo-danger/10 px-3 py-2 text-[12.5px] text-odoo-danger"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-odoo-primary text-[14px] font-medium text-white transition-colors hover:bg-odoo-primary-hover focus:outline-none focus:ring-2 focus:ring-odoo-focus/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {login.isPending ? "Входим…" : "Войти"}
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] leading-relaxed text-odoo-text-muted">
            Доступ выдаёт администратор компании.
            <br />
            Забыли пароль — обратитесь к нему.
          </p>
        </div>
      </main>

      <footer className="pb-7 text-center text-[12px] text-odoo-text-light">
        Детроид · транспортная компания
      </footer>
    </div>
  );
}
