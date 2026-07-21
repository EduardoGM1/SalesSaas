import { Link, Navigate } from "react-router-dom";
import {
  NavIconDashboard,
  NavIconGoals,
  NavIconTools,
  NavIconUsers,
  NavIconSupport,
  NavIconRoles,
  NavIconLogs,
} from "@/components/admin/admin-nav-icons";
import {
  ADMIN_NAV_PERMISSIONS,
  adminPermissionSetHas,
  expandAdminPermissionSet,
} from "@/lib/auth/permissions";
import { useI18n } from "@/hooks/use-i18n.js";

export const ADMIN_TABS = [
  { href: "/admin", labelKey: "admin.tab.overview", icon: NavIconDashboard, exact: true },
  { href: "/admin/users", labelKey: "admin.tab.users", icon: NavIconUsers },
  { href: "/admin/groups", labelKey: "admin.tab.groups", icon: NavIconUsers, superOnly: true },
  { href: "/admin/modules", labelKey: "admin.tab.modules", icon: NavIconTools, superOnly: true },
  { href: "/admin/roles", labelKey: "admin.tab.roles", icon: NavIconRoles },
  { href: "/admin/logs", labelKey: "admin.tab.logs", icon: NavIconLogs },
  { href: "/admin/goals", labelKey: "admin.tab.goals", icon: NavIconGoals },
  { href: "/admin/tools", labelKey: "admin.tab.tools", icon: NavIconTools },
  { href: "/admin/support", labelKey: "admin.tab.support", icon: NavIconSupport },
];

function isTabActive(pathname, href, exact) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminTopbarTabs({ permissions, pathname, isSuperAdmin = false }) {
  const { t } = useI18n();
  const allowed = expandAdminPermissionSet(permissions);
  const visibleTabs = isSuperAdmin
    ? ADMIN_TABS
    : ADMIN_TABS.filter((tab) => {
      if (tab.superOnly) return false;
      const perm = ADMIN_NAV_PERMISSIONS[tab.href];
      return perm ? adminPermissionSetHas(allowed, perm) : false;
    });

  if (!visibleTabs.length) {
    return (
      <nav className="topbar-admin-tabs" aria-label={t("admin.tabs.label")}>
        <span className="topbar-admin-tab topbar-admin-tab--empty">{t("admin.panel.noTabs")}</span>
      </nav>
    );
  }

  return (
    <nav className="topbar-admin-tabs" aria-label={t("admin.tabs.label")}>
      {visibleTabs.map((tab) => {
        const { href, labelKey, icon: Icon } = tab;
        const exact = "exact" in tab && tab.exact;
        return (
          <Link
            key={href}
            to={href}
            className={`topbar-admin-tab${isTabActive(pathname, href, exact) ? " active" : ""}`}
          >
            <Icon />
            <span>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}

/** Redirección de rutas CRM antiguas retiradas por privacidad. */
export function AdminLegacyRedirect() {
  return <Navigate to="/admin" replace />;
}
