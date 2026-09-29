import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/shared/ui/button";

/**
 * Страница входа — только вёрстка.
 * Никакой авторизации нет: «Войти» просто переходит на главную.
 */
export function LoginPage() {
  const navigate = useNavigate();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    navigate("/");
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
            defaultValue="a.sokolov@detroid.ru"
            className="w-full rounded-[4px] border border-odoo-border px-2.5 py-1.5 text-sm focus:border-odoo-primary focus:outline-none focus:ring-1 focus:ring-odoo-primary"
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-xs font-medium uppercase text-odoo-text-muted">
            Пароль
          </span>
          <input
            type="password"
            defaultValue="demo"
            className="w-full rounded-[4px] border border-odoo-border px-2.5 py-1.5 text-sm focus:border-odoo-primary focus:outline-none focus:ring-1 focus:ring-odoo-primary"
          />
        </label>
        <Button type="submit" className="w-full">
          Войти
        </Button>
      </form>
    </div>
  );
}
