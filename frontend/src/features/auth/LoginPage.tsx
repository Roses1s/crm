import { Eye, EyeOff, Loader2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import { useIsAuthenticated } from "@/shared/api/auth";
import { ApiError } from "@/shared/api/client";
import { useLogin } from "@/shared/api/hooks";

/**
 * Экран входа.
 *
 * Оформлен отдельно от остального интерфейса: здесь белый фон и крупная
 * типографика, а не рабочая плотная сетка CRM. Тёмная тема тут намеренно
 * не применяется — вход должен выглядеть одинаково у всех сотрудников.
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
        onSuccess: () =>
          navigate(location.state?.from ?? "/", { replace: true }),
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
    "h-10 w-full rounded-lg border border-[#e3e3e6] bg-white px-3 text-[14px] text-[#1b1d21] " +
    "placeholder:text-[#b4b4ba] transition-colors focus:border-[#714b67] focus:outline-none " +
    "focus:ring-2 focus:ring-[#714b67]/15";
  const labelCls = "mb-1 block text-[12.5px] font-medium text-[#5c5c66]";

  return (
    <div className="login-screen flex min-h-screen flex-col bg-white">
      <main className="flex flex-1 items-center justify-center px-5 py-10">
        <div className="w-full max-w-[320px]">
          <div className="flex flex-col items-center text-center">
            {/* Логотип компании; alt пустой — рядом идёт текстовое название. */}
            <img src="/logo.svg" alt="" className="h-14 w-14" />
            <h1 className="mt-4 text-[22px] font-semibold tracking-tight text-[#1b1d21]">
              Detroid
            </h1>
            <p className="mt-1 text-[13px] text-[#8a8a94]">Вход в систему</p>
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
                  aria-label={
                    showPassword ? "Скрыть пароль" : "Показать пароль"
                  }
                  className="absolute right-0.5 top-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md text-[#a0a0a8] transition-colors hover:bg-[#f4f4f6] hover:text-[#5c5c66]"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </label>

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-lg bg-[#fdf1f1] px-3 py-2 text-[12.5px] text-[#b3403f]"
              >
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="mt-5 inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[#714b67] text-[14px] font-medium text-white transition-colors hover:bg-[#5f3f57] focus:outline-none focus:ring-2 focus:ring-[#714b67]/30 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {login.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {login.isPending ? "Входим…" : "Войти"}
            </button>
          </form>

          <p className="mt-6 text-center text-[12px] leading-relaxed text-[#a0a0a8]">
            Доступ выдаёт администратор компании.
            <br />
            Забыли пароль — обратитесь к нему.
          </p>
        </div>
      </main>

      <footer className="pb-7 text-center text-[12px] text-[#b4b4ba]">
        CRM Детроид · транспортная компания
      </footer>
    </div>
  );
}
