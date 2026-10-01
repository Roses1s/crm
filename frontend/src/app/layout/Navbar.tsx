import { LayoutGrid, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { logout, useMe } from "@/shared/api/hooks";
import { toggleTheme, useTheme } from "@/shared/lib/theme";

/**
 * Верхняя панель. Разметка и классы — из исходника.
 * Вместо стора авторизации используется мок текущего пользователя,
 * «Выйти» просто ведёт на страницу логина, роли не проверяются.
 */
export function Navbar() {
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const navigate = useNavigate();
  const theme = useTheme();
  const { data: user } = useMe();
  const profileRef = useRef<HTMLDivElement>(null);
  const letter = (user?.first_name || user?.email || "U").slice(0, 1).toUpperCase();
  const fullName =
    [user?.last_name, user?.first_name].filter(Boolean).join(" ") || user?.email || "Сотрудник";

  useEffect(() => {
    if (!menu) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setMenu(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenu(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  const links = (
    <NavLink
      to="/crm"
      onClick={() => setSheet(false)}
      className={({ isActive }) =>
        `inline-flex h-10 items-center px-2 text-[13px] leading-none transition-colors ${
          isActive ? "font-medium text-odoo-text" : "text-odoo-text-soft hover:text-odoo-text"
        }`
      }
    >
      Лиды
    </NavLink>
  );

  return (
    <nav className="sticky top-0 z-50 flex h-10 shrink-0 items-center bg-odoo-nav pl-3 pr-4 text-odoo-text">
      <button
        type="button"
        className="mr-2 inline-flex h-10 items-center md:hidden"
        onClick={() => setSheet(true)}
        aria-label="Меню"
      >
        <Menu className="h-5 w-5" />
      </button>
      <Link
        to="/"
        className="inline-flex h-10 items-center text-odoo-text-muted transition-colors hover:text-odoo-text"
        title="Приложения"
        aria-label="Приложения"
      >
        <LayoutGrid className="h-4 w-4" strokeWidth={1.75} />
      </Link>
      <Link
        to="/crm"
        className="ml-2 inline-flex h-10 items-center text-[14px] font-semibold leading-none text-odoo-text"
      >
        CRM
      </Link>
      <div className="ml-auto flex h-10 items-center gap-2">
        <span
          className="max-w-36 truncate text-[13px] font-medium text-odoo-text sm:max-w-52"
          title={fullName}
        >
          {fullName}
        </span>
        <div ref={profileRef} className="relative">
          <button
            type="button"
            onClick={() => setMenu((v) => !v)}
            className="flex h-7 w-7 items-center justify-center rounded-sm bg-odoo-secondary text-[12px] font-semibold text-white hover:brightness-95"
            title={user?.email}
            aria-label="Меню профиля"
            aria-expanded={menu}
            aria-haspopup="menu"
          >
            {letter}
          </button>
          {menu && (
            <div
              role="menu"
              className="absolute right-0 mt-2 min-w-[200px] rounded-md border border-odoo-border bg-odoo-surface py-1 text-odoo-text shadow-lg"
            >
              <div className="px-3 py-1.5 text-xs text-odoo-text-muted">{user?.email}</div>
              {user?.role === "admin" && (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                  onClick={() => {
                    setMenu(false);
                    navigate("/admin");
                  }}
                >
                  Отчёты
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={theme === "dark"}
                aria-label="Тёмный режим"
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={toggleTheme}
              >
                Тёмный режим
                <span
                  className={`relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors ${
                    theme === "dark" ? "bg-odoo-success" : "bg-odoo-border"
                  }`}
                >
                  <span
                    className={`absolute h-3 w-3 rounded-full bg-white transition-transform ${
                      theme === "dark" ? "translate-x-[18px]" : "translate-x-[2px]"
                    }`}
                  />
                </span>
              </button>
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-odoo-bg"
                onClick={() => {
                  setMenu(false);
                  logout();
                  navigate("/login", { replace: true });
                }}
              >
                Выйти
              </button>
            </div>
          )}
        </div>
      </div>

      {sheet && (
        <div
          className="fixed inset-0 z-[60] bg-odoo-overlay/20 md:hidden"
          onClick={() => setSheet(false)}
        >
          <div
            className="h-full w-64 bg-odoo-surface p-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <span className="font-semibold">CRM</span>
              <button type="button" onClick={() => setSheet(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex flex-col">{links}</div>
          </div>
        </div>
      )}
    </nav>
  );
}
