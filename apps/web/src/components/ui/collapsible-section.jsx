import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sección colapsable (accordion). En desktop con `mobileOnly` permanece expandida. */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = true,
  mobileOnly = false,
  className,
  bodyClassName,
  children,
  id,
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      id={id}
      className={cn(
        "collapsible-section",
        mobileOnly && "collapsible-section--mobile-only",
        !open && "is-collapsed",
        className,
      )}
    >
      <button
        type="button"
        className="collapsible-section-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <div className="collapsible-section-titles">
          <div className="collapsible-section-title">{title}</div>
          {subtitle ? <div className="collapsible-section-sub">{subtitle}</div> : null}
        </div>
        <ChevronDown
          size={18}
          className={cn("collapsible-section-chevron", open && "is-open")}
          aria-hidden="true"
        />
      </button>
      <div className={cn("collapsible-section-body", bodyClassName)}>{children}</div>
    </section>
  );
}
