
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useMounted } from "@/hooks/use-mounted";
import {
  BarChart3, Calendar, Target, Users, Wrench, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/client";
import { hasAnyAdminAccess } from "@/lib/auth/permissions";

const NAV = [
  { href: "/", label: "Agenda", icon: Calendar },
  { href: "/goals", label: "Dashboard", icon: BarChart3 },
  { href: "/metas", label: "Metas", icon: Target },
  { href: "/clients", label: "Clientes", icon: Users },
  { href: "/tools", label: "Herramientas", icon: Wrench },
];

const LABELS_EN: Record<string, string> = {
  Agenda: "Agenda",
  Dashboard: "Dashboard",
  Metas: "Goals",
  Clientes: "Clients",
  Herramientas: "Tools",
  Admin: "Admin",
};

export function Sidebar() {
  const { pathname } = useLocation();
  const mounted = useMounted();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const settings = useDbStore((s) => s.db.settings);
  const language = mounted ? settings?.language || "es" : "es";
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    const sb = createClient();
    sb.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: profile } = await sb
        .from("profiles")
        .select("role, is_super_admin, admin_permissions")
        .eq("id", data.user.id)
        .single();
      if (!active || !profile) return;
      setIsAdmin(hasAnyAdminAccess({
        id: data.user.id,
        role: profile.role ?? "user",
        is_super_admin: profile.is_super_admin === true,
        admin_permissions: Array.isArray(profile.admin_permissions) ? profile.admin_permissions : [],
      }));
    });
    return () => {
      active = false;
    };
  }, []);

  const footer = mounted && isAdmin ? [{ href: "/admin", label: "Admin", icon: Shield }] : [];
  const avatarLabel = mounted
    ? (settings?.userInitials || settings?.userName?.split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "M").toUpperCase()
    : "M";

  return (
    <>
      <div className={cn("sb-overlay", sidebarOpen && "show")} onClick={closeSidebar} aria-hidden />
      <aside className={cn("sidebar", sidebarOpen && "open")} id="sidebar">
        <Link to="/" className="sb-logo" title="Usuario" onClick={closeSidebar}>
          <div className="sb-user-avatar" id="sb-user-avatar" suppressHydrationWarning>
            {avatarLabel.slice(0, 3)}
          </div>
        </Link>
        <nav className="sb-nav">
          {NAV.map(({ href, label, icon: Icon }) => {
            const visibleLabel = language === "en" ? LABELS_EN[label] || label : label;
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                to={href}
                className={cn("sb-item", active && "active")}
                onClick={closeSidebar}
              >
                <Icon size={18} strokeWidth={2} />
                <span className="sb-tooltip">{visibleLabel}</span>
              </Link>
            );
          })}
        </nav>
        {footer.length > 0 && (
          <>
            <div className="sb-divider" />
            <nav className="sb-nav" style={{ flex: "0 0 auto" }}>
              {footer.map(({ href, label, icon: Icon }) => {
                const visibleLabel = language === "en" ? LABELS_EN[label] || label : label;
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    to={href}
                    className={cn("sb-item", active && "active")}
                    onClick={closeSidebar}
                  >
                    <Icon size={18} strokeWidth={2} />
                    <span className="sb-tooltip">{visibleLabel}</span>
                  </Link>
                );
              })}
            </nav>
          </>
        )}
      </aside>
    </>
  );
}
