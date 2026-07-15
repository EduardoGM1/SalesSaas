import { Link, Navigate } from "react-router-dom";
import {
  NavIconDashboard,
  NavIconGoals,
  NavIconTools,
  NavIconUsers,
  NavIconSupport,
} from "@/components/admin/admin-nav-icons";
import { ADMIN_NAV_PERMISSIONS } from "@/lib/auth/permissions";
import { useI18n } from "@/hooks/use-i18n.js";

export const ADMIN_TABS = [
  { href: "/admin", labelKey: "admin.tab.overview", icon: NavIconDashboard, exact: true },
  { href: "/admin/users", labelKey: "admin.tab.users", icon: NavIconUsers },
  { href: "/admin/goals", labelKey: "admin.tab.goals", icon: NavIconGoals },
  { href: "/admin/tools", labelKey: "admin.tab.tools", icon: NavIconTools },
  { href: "/admin/support", labelKey: "admin.tab.support", icon: NavIconSupport },
];

function isTabActive(pathname, href, exact) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminTopbarTabs({ permissions, pathname }) {
  const { t } = useI18n();
  const allowed = new Set(permissions);
  const visibleTabs = ADMIN_TABS.filter((tab) => {
    const perm = ADMIN_NAV_PERMISSIONS[tab.href];
    return perm ? allowed.has(perm) : false;
  });

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
