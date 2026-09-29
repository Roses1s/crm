import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "@/app/layout/AppShell";
import { LoginPage } from "@/features/auth/LoginPage";
import { KanbanPage } from "@/features/crm/KanbanPage";
import { LeadFormPage } from "@/features/crm/LeadFormPage";

// Набор маршрутов повторяет исходный router.tsx один в один.
// Отличие только одно: убран ProtectedRoute и проверка ролей — в макете
// страницы открываются по прямым ссылкам без какой-либо авторизации.
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
const DashboardPage = lazy(() =>
  import("@/features/admin/DashboardPage").then((m) => ({
    default: m.DashboardPage,
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
            <AppShell>
              <LauncherPage />
            </AppShell>
          }
        />
        <Route path="/crm" element={<KanbanPage />} />
        <Route path="/crm/leads/:id" element={<LeadFormPage />} />
        <Route path="/shipments" element={<ShipmentsPage />} />
        <Route path="/shipments/:id" element={<ShipmentFormPage />} />
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="carriers" element={<CarriersPage />} />
          <Route path="security" element={<SecurityPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
