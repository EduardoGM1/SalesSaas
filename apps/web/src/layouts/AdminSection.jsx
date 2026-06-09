import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar.jsx";
import { useAdminSession } from "@/hooks/use-admin-session.js";

/** Panel admin embebido en el shell principal (sidebar + topbar unificado). */
export function AdminSection() {
  const { pathname } = useLocation();
  const { loading, session } = useAdminSession();

  if (loading) {
    return (
      <>
        <Topbar title="Administración" subtitle="Cargando panel…" />
        <div className="admin-embedded-loading">Cargando panel admin…</div>
      </>
    );
  }
  if (!session) return <Navigate to="/" replace />;

  return (
    <div className="admin-embedded">
      <Topbar
        admin={{
          permissions: session.permissions,
          isSuperAdmin: session.isSuperAdmin,
          pathname,
        }}
      />
      <div className="admin-main">
        <Outlet context={session} />
      </div>
    </div>
  );
}
