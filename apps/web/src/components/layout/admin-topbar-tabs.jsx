import { Link } from "react-router-dom";
import { ADMIN_NAV_PERMISSIONS } from "@/lib/auth/permissions";
import { useI18n } from "@/hooks/use-i18n.js";
import {
  NavIconActivity,
  NavIconCalendar,
  NavIconDashboard,
  NavIconGoals,
  NavIconSales,
  NavIconUsers,
  NavIconWorksheets,
} from "@/components/admin/admin-nav-icons";

export const ADMIN_TABS = [
  { href: "/admin", labelKey: "admin.tab.overview", icon: NavIconDashboard, exact: true },
  { href: "/admin/users", labelKey: "admin.tab.users", icon: NavIconUsers },
  { href: "/admin/sales", labelKey: "admin.tab.sales", icon: NavIconSales },
  { href: "/admin/agenda", labelKey: "admin.tab.agenda", icon: NavIconCalendar },
  { href: "/admin/goals", labelKey: "admin.tab.goals", icon: NavIconGoals },
  { href: "/admin/activity", labelKey: "admin.tab.activity", icon: NavIconActivity },
  { href: "/admin/worksheets", labelKey: "admin.tab.worksheets", icon: NavIconWorksheets },
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
