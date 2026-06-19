import { Link, useLocation } from "react-router-dom";
import { useI18n } from "@/hooks/use-i18n.js";
import { ADMIN_NAV_ITEM, isNavItemActive } from "@/lib/nav-config.js";
import { cn } from "@/lib/utils";
import { navLabel } from "@/lib/i18n.js";
import { useAppNav } from "@/hooks/use-app-nav.js";

export function Sidebar() {
  const { pathname } = useLocation();
  const { lang: language } = useI18n();
  const {
    avatarUrl,
    avatarLabel,
    unreadMessages,
    sidebarGroups,
    isAdmin,
  } = useAppNav();

  return (
    <aside className="sidebar" id="sidebar">
      <Link to="/" className="sb-logo" title="Usuario">
        <div className="sb-user-avatar" id="sb-user-avatar" suppressHydrationWarning>
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="sb-user-avatar-img" />
          ) : (
            avatarLabel.slice(0, 3)
          )}
        </div>
      </Link>
      <nav className="sb-nav">
        {sidebarGroups.map((group, gi) => (
          <div key={gi} className="sb-nav-group">
            {gi > 0 && <div className="sb-divider" aria-hidden />}
            {group.map(({ href, label, icon: Icon, badgeKey }) => {
              const visibleLabel = navLabel(label, language);
              const active = isNavItemActive(pathname, href);
              const badge = badgeKey === "messages" && unreadMessages > 0 ? unreadMessages : null;
              return (
                <Link
                  key={href}
                  to={href}
                  className={cn("sb-item", active && "active")}
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
      {isAdmin && (
        <>
          <div className="sb-divider" />
          <nav className="sb-nav" style={{ flex: "0 0 auto" }}>
            {(() => {
              const { href, label, icon: Icon } = ADMIN_NAV_ITEM;
              const visibleLabel = navLabel(label, language);
              const active = isNavItemActive(pathname, href);
              return (
                <Link to={href} className={cn("sb-item", active && "active")}>
                  <Icon size={18} strokeWidth={2} />
                  <span className="sb-tooltip">{visibleLabel}</span>
                </Link>
              );
            })()}
          </nav>
        </>
      )}
    </aside>
  );
}
