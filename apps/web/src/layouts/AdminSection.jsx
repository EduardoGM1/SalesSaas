import { useEffect, useRef } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Topbar } from "@/components/layout/topbar.jsx";
import { AdminErrorBoundary } from "@/components/admin/admin-error-boundary.jsx";
import { useAdminSession } from "@/hooks/use-admin-session.js";
import { useI18n } from "@/hooks/use-i18n.js";
import {
  canAccessAdminPathByPermissions,
  getFirstAllowedAdminPath,
  hasAnyAdminNavPermission,
} from "@/lib/auth/permissions";
import { reportAdminPanelIssue } from "@/lib/observability.js";

/** Panel admin embebido en el shell principal (sidebar + topbar unificado). */
export function AdminSection() {
  const { t } = useI18n();
  const { pathname } = useLocation();
  const { loading, session } = useAdminSession();
  const reportedEmptyRef = useRef(false);

  const permissions = session?.permissions || [];
  const isSuper = Boolean(session?.isSuperAdmin);
  const firstAllowed = session
    ? getFirstAllowedAdminPath(permissions, isSuper)
    : null;
  const hasNavAccess = isSuper || hasAnyAdminNavPermission(permissions);
  const pathAllowed = session
    ? canAccessAdminPathByPermissions(permissions, pathname, isSuper)
    : false;

  useEffect(() => {
    if (loading || !session) return;
    if (hasNavAccess || reportedEmptyRef.current) return;
    reportedEmptyRef.current = true;
    void reportAdminPanelIssue({
      reason: "no_allowed_tabs",
      userId: session.userId || session.profile?.id || null,
      permissions,
      pathname,
      message: "Admin entered panel with no matching tab permissions",
    });
  }, [loading, session, hasNavAccess, permissions, pathname]);

  if (loading) {
    return (
      <>
        <Topbar title={t("admin.panel.title")} subtitle={t("admin.panel.loading")} />
        <div className="admin-embedded-loading">{t("admin.panel.loadingBody")}</div>
      </>
    );
  }
  if (!session) return <Navigate to="/" replace />;

  // Ninguna pestaña mapeada → mensaje explícito (nunca main vacío).
  if (!hasNavAccess || !firstAllowed) {
    return (
      <>
        <Topbar title={t("admin.panel.title")} subtitle={t("admin.panel.noAccessSub")} />
        <div className="admin-embedded-loading admin-panel-empty" role="status">
          <p className="card-heading" style={{ marginBottom: 8 }}>{t("admin.panel.noAccessTitle")}</p>
          <p className="card-sub" style={{ marginBottom: 0 }}>{t("admin.panel.noAccessBody")}</p>
        </div>
      </>
    );
  }

  // /admin sin dashboard:read (u otra ruta no autorizada) → primera tab permitida.
  // Una sola fuente: session.permissions (misma que las tabs). Sin loop Navigate.
  if (!pathAllowed) {
    if (pathname === firstAllowed) {
      // Defensa: no redirigir a sí mismo si el gate fallara de forma inconsistente.
      return (
        <>
          <Topbar title={t("admin.panel.title")} subtitle={t("admin.panel.noAccessSub")} />
          <div className="admin-embedded-loading admin-panel-empty" role="status">
            <p className="card-heading" style={{ marginBottom: 8 }}>{t("admin.panel.noAccessTitle")}</p>
            <p className="card-sub" style={{ marginBottom: 0 }}>{t("admin.panel.noAccessBody")}</p>
          </div>
        </>
      );
    }
    return <Navigate to={firstAllowed} replace />;
  }

  return (
    <div className="admin-embedded">
      <Topbar
        admin={{
          permissions,
          isSuperAdmin: isSuper,
          pathname,
        }}
      />
      <div className="admin-main">
        <AdminErrorBoundary
          userId={session.userId || session.profile?.id}
          permissions={permissions}
          pathname={pathname}
          title={t("admin.panel.sectionErrorTitle")}
          subtitle={t("admin.panel.sectionErrorBody")}
        >
          <Outlet context={session} />
        </AdminErrorBoundary>
      </div>
    </div>
  );
}
