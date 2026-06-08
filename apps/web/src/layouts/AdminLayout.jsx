import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AdminTopbar } from "@/components/admin/admin-topbar.jsx";
import { useAdminSession } from "@/hooks/use-admin-session.js";

export function AdminLayout() {
  const { pathname } = useLocation();
  const { loading, session } = useAdminSession();

  if (loading) return <div className="sales-page">Cargando panel admin…</div>;
  if (!session) return <Navigate to="/" replace />;

  return (
    <div className="admin-shell">
      <AdminTopbar
        permissions={session.permissions}
        isSuperAdmin={session.isSuperAdmin}
        pathname={pathname}
      />
      <main className="admin-main"><Outlet context={session} /></main>
    </div>
  );
}
