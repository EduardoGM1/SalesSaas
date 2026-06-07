import Link from "next/link";
import { ADMIN_NAV_PERMISSIONS } from "@/lib/auth/permissions";
import {
  NavIconActivity,
  NavIconCalendar,
  NavIconDashboard,
  NavIconGoals,
  NavIconSales,
  NavIconUsers,
  NavIconWorksheets,
} from "./admin-nav-icons";

const TABS = [
  { href: "/admin", label: "Resumen", icon: NavIconDashboard, exact: true },
  { href: "/admin/users", label: "Usuarios", icon: NavIconUsers },
  { href: "/admin/sales", label: "Ventas", icon: NavIconSales },
  { href: "/admin/agenda", label: "Agenda", icon: NavIconCalendar },
  { href: "/admin/goals", label: "Metas", icon: NavIconGoals },
  { href: "/admin/activity", label: "Actividad", icon: NavIconActivity },
  { href: "/admin/worksheets", label: "Worksheets", icon: NavIconWorksheets },
] as const;

function isTabActive(pathname: string, href: string, exact?: boolean): boolean {
  if (exact) return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Barra superior del panel admin — 100 % servidor (sin chunks cliente). */
export function AdminTopbar({
  permissions,
  isSuperAdmin,
  pathname,
}: {
  permissions: string[];
  isSuperAdmin: boolean;
  pathname: string;
}) {
  const allowed = new Set(permissions);
  const visibleTabs = TABS.filter((tab) => {
    const perm = ADMIN_NAV_PERMISSIONS[tab.href];
    return perm ? allowed.has(perm) : false;
  });

  return (
    <header className="admin-topbar">
      <div className="admin-brand">
        <span className="admin-brand-badge">{isSuperAdmin ? "Super Admin" : "Admin"}</span>
        <span className="admin-brand-title">Panel del sistema</span>
      </div>
      <nav className="admin-tabs">
        {visibleTabs.map((tab) => {
          const { href, label, icon: Icon } = tab;
          const exact = "exact" in tab && tab.exact;
          return (
          <Link
            key={href}
            href={href}
            prefetch
            className={`admin-tab${isTabActive(pathname, href, exact) ? " active" : ""}`}
          >
            <Icon />
            <span>{label}</span>
          </Link>
          );
        })}
      </nav>
      <Link href="/" className="admin-back">
        <span className="admin-back-icon" aria-hidden>←</span>
        <span>Volver a la app</span>
      </Link>
    </header>
  );
}
