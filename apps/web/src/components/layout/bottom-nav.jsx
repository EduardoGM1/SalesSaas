import { Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/hooks/use-i18n.js";
import { navLabel, navLabelCompact } from "@/lib/i18n.js";
import { isNavItemActive } from "@/lib/nav-config.js";
import { useAppNav } from "@/hooks/use-app-nav.js";

const COMPACT_NAV_MQ = "(max-width: 390px)";

export function BottomNav() {
  const { pathname } = useLocation();
  const { lang: language, t } = useI18n();
  const { mobileBottomItems } = useAppNav();
  const [compactLabels, setCompactLabels] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(COMPACT_NAV_MQ).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(COMPACT_NAV_MQ);
    const sync = () => setCompactLabels(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!mobileBottomItems.length) return null;

  const labelFor = compactLabels ? navLabelCompact : navLabel;

  return (
    <nav className="bottom-nav" aria-label={t("nav.aria")}>
      {mobileBottomItems.map(({ href, label, icon: Icon }) => {
        const active = isNavItemActive(pathname, href);
        const visibleLabel = labelFor(label, language);
        return (
          <Link
            key={href}
            to={href}
            className={cn("bottom-nav-item", active && "active")}
            aria-current={active ? "page" : undefined}
            title={navLabel(label, language)}
          >
            <Icon size={20} strokeWidth={2} aria-hidden />
            <span className={cn("bottom-nav-label", compactLabels && "bottom-nav-label--compact")}>
              {visibleLabel}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
