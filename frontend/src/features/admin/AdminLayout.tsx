import { Navigate, NavLink, Outlet } from "react-router-dom";
import { AppShell, Breadcrumb } from "@/app/layout/AppShell";
import { useMe } from "@/shared/api/hooks";

const LINKS = [
  { to: "/admin/users", label: "Пользователи" },
  { to: "/admin/security", label: "Безопасность" },
];

export function AdminLayout() {
  // Настоящая проверка прав живёт на бэкенде: каждая admin-ручка делает
  // её сама. Этот редирект — только удобство: не-админ, случайно открывший
  // /admin по прямой ссылке, не увидит пустой экран и ворох ошибок 403 от
  // дочерних запросов, а сразу уйдёт на главную.
  const { data: user, isLoading } = useMe();

  if (isLoading) return null;
  if (user && user.role !== "admin") return <Navigate to="/" replace />;

  return (
    <AppShell>
      <Breadcrumb items={["Панель управления"]} />
      <div className="flex">
        <aside className="w-48 shrink-0 border-r border-odoo-border-light bg-odoo-surface p-3">
          {LINKS.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `block rounded-[4px] px-2 py-1.5 text-sm transition-colors hover:bg-odoo-surface-hover ${isActive ? "bg-odoo-primary/10 font-semibold text-odoo-primary" : "text-odoo-text"}`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </aside>
        <div className="min-w-0 flex-1 p-4">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
