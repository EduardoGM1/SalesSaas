
import { Link } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useMounted } from "@/hooks/use-mounted";
import {
  BarChart3, Calendar, Target, Users, Wrench, Shield, Receipt, UserPlus, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useDbStore } from "@/stores/db-store";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { hasAnyAdminAccess } from "@/lib/auth/permissions";
import { hasUserFeature } from "@/lib/auth/user-features";
import { watchSession } from "@/lib/session-api.js";
import { useI18n } from "@/hooks/use-i18n.js";
import { navLabel } from "@/lib/i18n.js";
import { messagesApi } from "@/lib/network-api.js";

const NAV_GROUPS = [
  [
    { href: "/", label: "Agenda", icon: Calendar },
    { href: "/goals", label: "Dashboard", icon: BarChart3 },
    { href: "/metas", label: "Metas", icon: Target },
  ],
  [
    { href: "/clients", label: "Clientes", icon: Users },
  ],
  [
    { href: "/network", label: "Red", icon: UserPlus, cloudOnly: true },
    { href: "/messages", label: "Mensajes", icon: MessageSquare, cloudOnly: true, badgeKey: "messages" },
  ],
  [
    { href: "/tools", label: "Herramientas", icon: Wrench },
    { href: "/sales", label: "Ventas", icon: Receipt, feature: "sales:history" },
  ],
];

export function Sidebar() {
  const { pathname } = useLocation();
  const mounted = useMounted();
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const closeSidebar = useAppStore((s) => s.closeSidebar);
  const settings = useDbStore((s) => s.db.settings);
  const { lang: language } = useI18n();
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const cloudEnabled = mounted && isSupabaseConfigured();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    return watchSession((session) => {
      const profile = session?.profile;
      if (!profile) {
        setIsAdmin(false);
        setAvatarUrl(null);
        setUserProfile(null);
        return;
      }
      setUserProfile(profile);
      setAvatarUrl(profile.avatar_url ?? null);
      setIsAdmin(hasAnyAdminAccess({
        id: profile.id,
        role: profile.role ?? "user",
        is_super_admin: profile.is_super_admin === true,
        admin_permissions: Array.isArray(profile.admin_permissions) ? profile.admin_permissions : [],
      }));
    });
  }, []);

  useEffect(() => {
    if (!cloudEnabled) return;
    const load = () => messagesApi.unreadCount()
      .then((d) => setUnreadMessages(d?.count ?? 0))
      .catch(() => {});
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [cloudEnabled]);

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
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="sb-user-avatar-img" />
            ) : (
              avatarLabel.slice(0, 3)
            )}
          </div>
        </Link>
        <nav className="sb-nav">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="sb-nav-group">
              {gi > 0 && <div className="sb-divider" aria-hidden />}
              {group.filter((item) => {
                if (item.cloudOnly && !cloudEnabled) return false;
                if (item.feature && !hasUserFeature(userProfile, item.feature)) return false;
                return true;
              }).map(({ href, label, icon: Icon, badgeKey }) => {
                const visibleLabel = navLabel(label, language);
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                const badge = badgeKey === "messages" && unreadMessages > 0 ? unreadMessages : null;
                return (
                  <Link
                    key={href}
                    to={href}
                    className={cn("sb-item", active && "active")}
                    onClick={closeSidebar}
                  >
                    <Icon size={18} strokeWidth={2} />
                    {badge ? <span className="sb-badge">{badge > 9 ? "9+" : badge}</span> : null}
                    <span className="sb-tooltip">{visibleLabel}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        {footer.length > 0 && (
          <>
            <div className="sb-divider" />
            <nav className="sb-nav" style={{ flex: "0 0 auto" }}>
              {footer.map(({ href, label, icon: Icon }) => {
                const visibleLabel = navLabel(label, language);
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
