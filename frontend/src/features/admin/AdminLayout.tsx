import { NavLink, Outlet } from "react-router-dom";
import { AppShell, Breadcrumb } from "@/app/layout/AppShell";

const LINKS = [
  { to: "/admin/users", label: "Пользователи" },
  { to: "/admin/carriers", label: "Перевозчики" },
  { to: "/admin/security", label: "Безопасность" },
];

export function AdminLayout() {
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
