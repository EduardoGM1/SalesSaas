import { Link } from "react-router-dom";
import { ADMIN_NAV_PERMISSIONS } from "@/lib/auth/permissions";
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
  { href: "/admin", label: "Resumen", icon: NavIconDashboard, exact: true },
  { href: "/admin/users", label: "Usuarios", icon: NavIconUsers },
  { href: "/admin/sales", label: "Ventas", icon: NavIconSales },
  { href: "/admin/agenda", label: "Agenda", icon: NavIconCalendar },
  { href: "/admin/goals", label: "Metas", icon: NavIconGoals },
  { href: "/admin/activity", label: "Actividad", icon: NavIconActivity },
  { href: "/admin/worksheets", label: "Worksheets", icon: NavIconWorksheets },
];

function isTabActive(pathname, href, exact) {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminTopbarTabs({ permissions, pathname }) {
  const allowed = new Set(permissions);
  const visibleTabs = ADMIN_TABS.filter((tab) => {
    const perm = ADMIN_NAV_PERMISSIONS[tab.href];
    return perm ? allowed.has(perm) : false;
  });

  return (
    <nav className="topbar-admin-tabs" aria-label="Secciones de administración">
      {visibleTabs.map((tab) => {
        const { href, label, icon: Icon } = tab;
        const exact = "exact" in tab && tab.exact;
        return (
          <Link
            key={href}
            to={href}
            className={`topbar-admin-tab${isTabActive(pathname, href, exact) ? " active" : ""}`}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
