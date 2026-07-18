import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar.jsx";
import { useAdminSession } from "@/hooks/use-admin-session.js";
import { canAccessAdminPath } from "@/lib/auth/permissions";

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

  const perms = new Set(session.permissions || []);
  // Soporte (u otros sin resumen): /admin → primera pestaña permitida
  if (pathname === "/admin" && !perms.has("dashboard:read")) {
    if (perms.has("ver_tickets_soporte") || perms.has("support:read")) {
      return <Navigate to="/admin/support" replace />;
    }
    if (perms.has("users:read")) return <Navigate to="/admin/users" replace />;
    if (perms.has("admin:roles")) return <Navigate to="/admin/roles" replace />;
  }

  if (session.profile && !canAccessAdminPath(session.profile, pathname)) {
    // Fallback: si el path no está permitido, ir a soporte o home admin
    if (perms.has("ver_tickets_soporte") || perms.has("support:read")) {
      return <Navigate to="/admin/support" replace />;
    }
    return <Navigate to="/" replace />;
  }

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
