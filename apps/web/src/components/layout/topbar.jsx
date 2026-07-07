import { Link } from "react-router-dom";
import Image from "@/components/ui/safe-image.jsx";
import { ArrowLeft, Menu, Settings } from "lucide-react";
import { useI18n } from "@/hooks/use-i18n.js";
import { useAppStore } from "@/stores/app-store";
import { AdminTopbarTabs } from "@/components/layout/admin-topbar-tabs.jsx";
import { MobileTopAvatar, MobileTopNavActions, DesktopTopNavActions } from "@/components/layout/mobile-top-nav.jsx";

export function Topbar({ title, subtitle, showMonthNav, admin }) {
  const { t, months } = useI18n();
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);

  if (admin) {
    const { permissions, isSuperAdmin, pathname } = admin;
    return (
      <header className="topbar topbar--admin">
        <div className="topbar-primary">
          <div className="tb-left">
            <button type="button" className="mobile-menu-btn mobile-menu-btn--admin" onClick={toggleSidebar} aria-label={t("common.menu")}>
              <Menu size={18} />
            </button>
            <div>
              <div className="tb-page-title tb-page-title--admin">
                <span className="tb-admin-badge">{isSuperAdmin ? "Super Admin" : "Admin"}</span>
                <span>{t("topbar.adminPanel")}</span>
              </div>
              <div className="tb-page-sub">{t("topbar.administration")}</div>
            </div>
          </div>
          <div className="tb-right">
            <Link to="/" className="btn btn-ghost btn-sm tb-back-app">
              <ArrowLeft size={15} />
              <span>{t("topbar.backToApp")}</span>
            </Link>
            <Link to="/settings" className="top-settings-btn top-settings-btn--desktop" title={t("common.settings")} aria-label={t("common.settings")}>
              <Settings size={17} />
            </Link>
          </div>
        </div>
        <AdminTopbarTabs permissions={permissions} pathname={pathname} />
      </header>
    );
  }

  const saletseLogo = (
    <div className="topbar-brand" title="Saletse" aria-label="Saletse">
      <Image src="/saletse-logo.png" alt="Saletse" width={132} height={30} priority />
    </div>
  );

  return (
    <header className="topbar">
      <div className="topbar-mobile-brand">{saletseLogo}</div>
      <div className="topbar-mobile-main">
        <div className="tb-left">
          <MobileTopAvatar />
          <button type="button" className="mobile-menu-btn mobile-menu-btn--legacy" onClick={toggleSidebar} aria-label={t("common.menu")}>
            <Menu size={18} />
          </button>
          <div className="tb-page-copy">
            <div className="tb-page-title">{title}</div>
            <div className="tb-page-sub">{subtitle}</div>
          </div>
        </div>
        <div className="tb-right">
          {showMonthNav && (
            <div className="tb-month-nav">
              <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label={t("common.previousMonth")}>‹</button>
              <div className="tb-month-label">{months[calMonth]} {calYear}</div>
              <button type="button" className="tb-nav-btn" onClick={calNext} aria-label={t("common.nextMonth")}>›</button>
            </div>
          )}
          <DesktopTopNavActions />
          {saletseLogo}
          <MobileTopNavActions />
          <Link to="/settings" className="top-settings-btn top-settings-btn--desktop" title={t("common.settings")} aria-label={t("common.settings")}>
            <Settings size={17} />
          </Link>
        </div>
      </div>
    </header>
  );
}
