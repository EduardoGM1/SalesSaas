
import { Link } from "react-router-dom";
import Image from "@/components/ui/safe-image.jsx";
import { ArrowLeft, Menu, Settings } from "lucide-react";
import { MONTHS } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";
import { AdminTopbarTabs } from "@/components/layout/admin-topbar-tabs.jsx";

export function Topbar({ title, subtitle, showMonthNav, admin }) {
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
            <button type="button" className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Menú">
              <Menu size={18} />
            </button>
            <div>
              <div className="tb-page-title tb-page-title--admin">
                <span className="tb-admin-badge">{isSuperAdmin ? "Super Admin" : "Admin"}</span>
                <span>Panel del sistema</span>
              </div>
              <div className="tb-page-sub">Administración</div>
            </div>
          </div>
          <div className="tb-right">
            <Link to="/" className="btn btn-ghost btn-sm tb-back-app">
              <ArrowLeft size={15} />
              <span>Volver a la app</span>
            </Link>
            <Link to="/settings" className="top-settings-btn" title="Configuración" aria-label="Configuración">
              <Settings size={17} />
            </Link>
          </div>
        </div>
        <AdminTopbarTabs permissions={permissions} pathname={pathname} />
      </header>
    );
  }

  return (
    <header className="topbar">
      <div className="tb-left">
        <button type="button" className="mobile-menu-btn" onClick={toggleSidebar} aria-label="Menú">
          <Menu size={18} />
        </button>
        <div>
          <div className="tb-page-title">{title}</div>
          <div className="tb-page-sub">{subtitle}</div>
        </div>
      </div>
      <div className="tb-right">
        {showMonthNav && (
          <div className="tb-month-nav">
            <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label="Mes anterior">‹</button>
            <div className="tb-month-label">{MONTHS[calMonth]} {calYear}</div>
            <button type="button" className="tb-nav-btn" onClick={calNext} aria-label="Mes siguiente">›</button>
          </div>
        )}
        <div className="topbar-brand" title="Saletse" aria-label="Saletse">
          <Image src="/saletse-logo.png" alt="Saletse" width={132} height={30} priority />
        </div>
        <Link to="/settings" className="top-settings-btn" title="Configuración" aria-label="Configuración">
          <Settings size={17} />
        </Link>
      </div>
    </header>
  );
}
