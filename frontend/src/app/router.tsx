import { Suspense, lazy } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { RequireAuth } from "@/app/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { KanbanPage } from "@/features/crm/KanbanPage";
import { LeadFormPage } from "@/features/crm/LeadFormPage";

// Страничная загрузка: тяжёлые разделы не входят в стартовый пакет.
const AdminLayout = lazy(() =>
  import("@/features/admin/AdminLayout").then((m) => ({
    default: m.AdminLayout,
  })),
);
const SecurityPage = lazy(() =>
  import("@/features/admin/SecurityPage").then((m) => ({
    default: m.SecurityPage,
  })),
);
const UsersPage = lazy(() =>
  import("@/features/admin/UsersPage").then((m) => ({ default: m.UsersPage })),
);
const CustomersPage = lazy(() =>
  import("@/features/customers/CustomersPage").then((m) => ({
    default: m.CustomersPage,
  })),
);
const LauncherPage = lazy(() =>
  import("@/features/launcher/LauncherPage").then((m) => ({
    default: m.LauncherPage,
  })),
);
const ShipmentFormPage = lazy(() =>
  import("@/features/shipments/ShipmentFormPage").then((m) => ({
    default: m.ShipmentFormPage,
  })),
);
const ShipmentsPage = lazy(() =>
  import("@/features/shipments/ShipmentsPage").then((m) => ({
    default: m.ShipmentsPage,
  })),
);
const AccountingPage = lazy(() =>
  import("@/features/accounting/AccountingPage").then((m) => ({
    default: m.AccountingPage,
  })),
);

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[13px] text-odoo-text-muted">
      Загрузка…
    </div>
  );
}

function AdminIndex() {
  return <Navigate to="users" replace />;
}

const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  {
    path: "/",
    element: (
      <RequireAuth>
        <AppShell>
          <LauncherPage />
        </AppShell>
      </RequireAuth>
    ),
  },
  {
    path: "/crm",
    element: (
      <RequireAuth>
        <KanbanPage />
      </RequireAuth>
    ),
  },
  {
    path: "/crm/leads/:id",
    element: (
      <RequireAuth>
        <LeadFormPage />
      </RequireAuth>
    ),
  },
  {
    path: "/customers",
    element: (
      <RequireAuth>
        <CustomersPage />
      </RequireAuth>
    ),
  },
  {
    path: "/shipments",
    element: (
      <RequireAuth>
        <ShipmentsPage />
      </RequireAuth>
    ),
  },
  {
    path: "/shipments/:id",
    element: (
      <RequireAuth>
        <ShipmentFormPage />
      </RequireAuth>
    ),
  },
  {
    path: "/accounting",
    element: (
      <RequireAuth>
        <AccountingPage />
      </RequireAuth>
    ),
  },
  {
    path: "/admin",
    element: (
      <RequireAuth>
        <AdminLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <AdminIndex /> },
      { path: "users", element: <UsersPage /> },
      { path: "security", element: <SecurityPage /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

/** Маршрутизатор данных также позволяет формам удерживать переход до автосохранения. */
export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
