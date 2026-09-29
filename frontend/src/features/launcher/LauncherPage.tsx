import { Kanban, LayoutGrid, Package, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { launcherApps } from "@/shared/mock/launcher";

const ICONS: Record<string, typeof LayoutGrid> = {
  Kanban,
  Package,
  Settings,
  LayoutGrid,
};

/** Экран «Приложения». Список берётся из мока, ролей и прав нет. */
export function LauncherPage() {
  return (
    <div className="min-h-[calc(100vh-56px)] bg-odoo-bg px-6 py-10">
      <h1 className="mb-6 text-center text-odoo-text">Приложения</h1>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {launcherApps.map((app) => {
          const Icon = ICONS[app.icon] ?? LayoutGrid;
          return (
            <Link
              key={app.slug}
              to={app.route}
              className="rounded-md border border-odoo-border-light bg-odoo-surface p-5 shadow-xs transition-all duration-150 hover:border-odoo-border hover:shadow-md"
            >
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[4px] bg-odoo-primary/10 text-odoo-primary">
                <Icon className="h-5 w-5" strokeWidth={1.75} />
              </div>
              <div className="font-semibold text-odoo-text">{app.name}</div>
              <p className="mt-1 text-xs text-odoo-text-muted">{app.description}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
