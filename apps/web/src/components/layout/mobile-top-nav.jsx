import { Link, useLocation } from "react-router-dom";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n.js";
import { navLabel } from "@/lib/i18n.js";
import { isNavItemActive } from "@/lib/nav-config.js";
import { useAppNav } from "@/hooks/use-app-nav.js";

export function MobileTopNavActions() {
  const { pathname } = useLocation();
  const { lang: language, t } = useI18n();
  const { mobileHeaderItems, unreadMessages } = useAppNav();

  return (
    <div className="topbar-mobile-actions">
      {mobileHeaderItems.map(({ href, label, icon: Icon, badgeKey }) => {
        const active = isNavItemActive(pathname, href);
        const visibleLabel = navLabel(label, language);
        const badge = badgeKey === "messages" && unreadMessages > 0 ? unreadMessages : null;
        return (
          <Link
            key={href}
            to={href}
            className={cn("top-settings-btn", active && "active")}
            title={visibleLabel}
            aria-label={visibleLabel}
          >
            <Icon size={17} strokeWidth={2} />
            {badge ? (
              <span className="topbar-action-badge">{badge > 9 ? "9+" : badge}</span>
            ) : null}
          </Link>
        );
      })}
      <Link to="/settings" className="top-settings-btn" title={t("common.settings")} aria-label={t("common.settings")}>
        <Settings size={17} />
      </Link>
    </div>
  );
}

export function DesktopTopNavActions() {
  const { pathname } = useLocation();
  const { lang: language } = useI18n();
  const { mobileHeaderItems, unreadMessages } = useAppNav();

  return (
    <div className="topbar-desktop-actions">
      {mobileHeaderItems.map(({ href, label, icon: Icon, badgeKey }) => {
        const active = isNavItemActive(pathname, href);
        const visibleLabel = navLabel(label, language);
        const badge = badgeKey === "messages" && unreadMessages > 0 ? unreadMessages : null;
        return (
          <Link
            key={href}
            to={href}
            className={cn("top-settings-btn", active && "active")}
            title={visibleLabel}
            aria-label={visibleLabel}
          >
            <Icon size={17} strokeWidth={2} />
            {badge ? (
              <span className="topbar-action-badge">{badge > 9 ? "9+" : badge}</span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}

export function MobileTopAvatar() {
  const { avatarUrl, avatarLabel } = useAppNav();
  const { t } = useI18n();

  return (
    <Link to="/settings" className="mobile-top-avatar" aria-label={t("common.settings")}>
      <div className="mobile-top-avatar-inner" suppressHydrationWarning>
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="mobile-top-avatar-img" />
        ) : (
          avatarLabel.slice(0, 1)
        )}
      </div>
    </Link>
  );
}
