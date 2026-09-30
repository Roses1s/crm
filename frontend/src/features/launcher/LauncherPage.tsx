import { Kanban, LayoutGrid, Package, Settings } from "lucide-react";
import { Link } from "react-router-dom";
import { useLauncherApps } from "@/shared/api/hooks";

const ICONS: Record<string, typeof LayoutGrid> = {
  Kanban,
  Package,
  Settings,
  LayoutGrid,
};

/** Экран «Приложения». Список приходит из API и зависит от роли. */
export function LauncherPage() {
  const { data: apps = [] } = useLauncherApps();

  return (
    <div className="min-h-[calc(100vh-56px)] bg-odoo-bg px-6 py-10">
      <h1 className="mb-6 text-center text-odoo-text">Приложения</h1>
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {apps.length === 0 ? (
          <p className="col-span-full rounded-md border border-dashed border-odoo-border bg-odoo-surface px-4 py-8 text-center text-sm text-odoo-text-muted">
            Для вашей роли пока нет доступных приложений.
          </p>
        ) : (
          apps.map((app) => {
            const Icon = ICONS[app.icon] ?? LayoutGrid;
            return (
              <Link
                key={app.slug}
                to={app.route}
                className="rounded-md border border-odoo-border-light bg-odoo-surface p-5 shadow-xs transition-all duration-150 hover:border-odoo-border hover:bg-odoo-surface-hover hover:shadow-md"
              >
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-[4px] bg-odoo-primary/10 text-odoo-primary">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div className="font-semibold text-odoo-text">{app.name}</div>
                <p className="mt-1 text-xs text-odoo-text-muted">{app.description}</p>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
