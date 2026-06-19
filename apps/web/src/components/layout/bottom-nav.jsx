import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n.js";
import { navLabel } from "@/lib/i18n.js";
import { isNavItemActive } from "@/lib/nav-config.js";
import { useAppNav } from "@/hooks/use-app-nav.js";

export function BottomNav() {
  const { pathname } = useLocation();
  const { lang: language, t } = useI18n();
  const { mobileBottomItems } = useAppNav();

  if (!mobileBottomItems.length) return null;

  return (
    <nav className="bottom-nav" aria-label={t("nav.aria")}>
      {mobileBottomItems.map(({ href, label, icon: Icon }) => {
        const active = isNavItemActive(pathname, href);
        const visibleLabel = navLabel(label, language);
        return (
          <Link
            key={href}
            to={href}
            className={cn("bottom-nav-item", active && "active")}
            aria-current={active ? "page" : undefined}
          >
            <Icon size={20} strokeWidth={2} aria-hidden />
            <span className="bottom-nav-label">{visibleLabel}</span>
          </Link>
        );
      })}
    </nav>
  );
}
