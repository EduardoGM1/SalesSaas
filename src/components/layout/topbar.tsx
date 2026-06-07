"use client";

import { Menu } from "lucide-react";
import { MONTHS } from "@/lib/constants";
import { useAppStore } from "@/stores/app-store";

interface TopbarProps {
  title: string;
  subtitle: string;
  showMonthNav?: boolean;
}

export function Topbar({ title, subtitle, showMonthNav }: TopbarProps) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const calYear = useAppStore((s) => s.calYear);
  const calMonth = useAppStore((s) => s.calMonth);
  const calPrev = useAppStore((s) => s.calPrev);
  const calNext = useAppStore((s) => s.calNext);

  return (
    <header className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <button type="button" className="tb-nav-btn lg:hidden" onClick={toggleSidebar} aria-label="Menú">
          <Menu size={16} />
        </button>
        <div>
          <div className="tb-title">{title}</div>
          <div className="tb-sub">{subtitle}</div>
        </div>
      </div>
      {showMonthNav && (
        <div className="tb-month-nav">
          <button type="button" className="tb-nav-btn" onClick={calPrev} aria-label="Mes anterior">‹</button>
          <div className="tb-month-label">{MONTHS[calMonth]} {calYear}</div>
          <button type="button" className="tb-nav-btn" onClick={calNext} aria-label="Mes siguiente">›</button>
        </div>
      )}
    </header>
  );
}
