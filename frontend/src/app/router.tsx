import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { RequireAuth } from "@/app/RequireAuth";
import { LoginPage } from "@/features/auth/LoginPage";
import { KanbanPage } from "@/features/crm/KanbanPage";
import { LeadFormPage } from "@/features/crm/LeadFormPage";

// Набор маршрутов повторяет исходный router.tsx один в один.
const AdminLayout = lazy(() =>
  import("@/features/admin/AdminLayout").then((m) => ({
    default: m.AdminLayout,
  })),
);
const CarriersPage = lazy(() =>
  import("@/features/admin/CarriersPage").then((m) => ({
    default: m.CarriersPage,
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

function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center text-[13px] text-odoo-text-muted">
      Загрузка…
    </div>
  );
}

export function AppRouter() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <AppShell>
                <LauncherPage />
              </AppShell>
            </RequireAuth>
          }
        />
        <Route
          path="/crm"
          element={
            <RequireAuth>
              <KanbanPage />
            </RequireAuth>
          }
        />
        <Route
          path="/crm/leads/:id"
          element={
            <RequireAuth>
              <LeadFormPage />
            </RequireAuth>
          }
        />
        <Route
          path="/shipments"
          element={
            <RequireAuth>
              <ShipmentsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/shipments/:id"
          element={
            <RequireAuth>
              <ShipmentFormPage />
            </RequireAuth>
          }
        />
        <Route
          path="/admin"
          element={
            <RequireAuth>
              <AdminLayout />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="users" replace />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="carriers" element={<CarriersPage />} />
          <Route path="security" element={<SecurityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
