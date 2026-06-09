import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AdminTopbar } from "@/components/admin/admin-topbar.jsx";
import { useAdminSession } from "@/hooks/use-admin-session.js";

/** Panel admin embebido en el shell principal (sidebar persistente). */
export function AdminSection() {
  const { pathname } = useLocation();
  const { loading, session } = useAdminSession();

  if (loading) {
    return <div className="admin-embedded-loading">Cargando panel admin…</div>;
  }
  if (!session) return <Navigate to="/" replace />;

  return (
    <div className="admin-embedded">
      <AdminTopbar
        permissions={session.permissions}
        isSuperAdmin={session.isSuperAdmin}
        pathname={pathname}
      />
      <div className="admin-main">
        <Outlet context={session} />
      </div>
    </div>
  );
}
