import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ChevronDown, LoaderCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n.js";
import { navLabel } from "@/lib/i18n.js";
import { isNavItemActive } from "@/lib/nav-config.js";
import { useAppNav } from "@/hooks/use-app-nav.js";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { WorkspaceSheet } from "@/components/layout/workspace-rail.jsx";

function HeaderNavLinks({ className }) {
  const { pathname, search } = useLocation();
  const { lang: language } = useI18n();
  const { mobileHeaderItems, unreadMessages } = useAppNav();

  return (
    <div className={className}>
      {mobileHeaderItems.map(({ href, label, icon: Icon, badgeKey }) => {
        const active = isNavItemActive(pathname, href, search);
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

export function MobileTopNavActions() {
  const { pathname } = useLocation();
  const { t } = useI18n();

  return (
    <div className="topbar-mobile-actions">
      <HeaderNavLinks className="topbar-mobile-actions-links" />
      <Link
        to="/settings"
        className={cn("top-settings-btn", pathname.startsWith("/settings") && "active")}
        title={t("common.settings")}
        aria-label={t("common.settings")}
      >
        <Settings size={17} />
      </Link>
    </div>
  );
}

export function DesktopTopNavActions() {
  return <HeaderNavLinks className="topbar-desktop-actions" />;
}

/** Avatar del header móvil: abre el selector de workspace. */
export function MobileTopAvatar() {
  const { avatarUrl, avatarLabel } = useAppNav();
  const { t } = useI18n();
  const { ready, active, workspaces, switching } = useWorkspace();
  const [open, setOpen] = useState(false);
  const canOpen = ready && Boolean(active) && workspaces.length > 1;

  return (
    <>
      <button
        type="button"
        className="mobile-top-avatar"
        aria-label={t("workspace.switchTitle")}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={switching}
        onClick={() => { if (canOpen) setOpen(true); }}
      >
        <div className="mobile-top-avatar-inner" suppressHydrationWarning>
          {switching ? (
            <LoaderCircle size={15} className="ws-rail-spinner" />
          ) : avatarUrl ? (
            <img src={avatarUrl} alt="" className="mobile-top-avatar-img" />
          ) : (
            avatarLabel.slice(0, 1)
          )}
        </div>
        {canOpen ? (
          <span className="mobile-top-avatar-caret" aria-hidden>
            <ChevronDown size={9} strokeWidth={3} />
          </span>
        ) : null}
      </button>
      <WorkspaceSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
