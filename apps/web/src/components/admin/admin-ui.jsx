import { useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

export function AdminPageHeader({ eyebrow, title, subtitle, actions, meta }) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header-copy">
        {eyebrow ? <div className="admin-page-eyebrow">{eyebrow}</div> : null}
        <h1 className="admin-h1">{title}</h1>
        {subtitle ? <p className="admin-sub">{subtitle}</p> : null}
        {meta ? <div className="admin-page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="admin-page-actions">{actions}</div> : null}
    </header>
  );
}

export function AdminSubNav({ items, activeId, onSelect, ariaLabel = "Secciones" }) {
  return (
    <nav className="admin-subnav" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = item.id === activeId;
        const content = (
          <>
            {item.icon ? <item.icon size={15} aria-hidden /> : null}
            <span>{item.label}</span>
            {item.count != null ? <span className="admin-subnav-count">{item.count}</span> : null}
          </>
        );
        if (item.href) {
          return (
            <Link
              key={item.id}
              to={item.href}
              className={cn("admin-subnav-item", active && "active")}
              aria-current={active ? "page" : undefined}
            >
              {content}
            </Link>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={cn("admin-subnav-item", active && "active")}
            aria-current={active ? "page" : undefined}
            onClick={() => onSelect?.(item.id)}
          >
            {content}
          </button>
        );
      })}
    </nav>
  );
}

export function AdminCard({ title, subtitle, action, children, className }) {
  return (
    <section className={cn("admin-card", className)}>
      {(title || subtitle || action) ? (
        <div className="admin-card-header">
          <div>
            {title ? <h2 className="admin-card-title">{title}</h2> : null}
            {subtitle ? <p className="admin-card-subtitle">{subtitle}</p> : null}
          </div>
          {action ? <div className="admin-card-action">{action}</div> : null}
        </div>
      ) : null}
      <div className="admin-card-body">{children}</div>
    </section>
  );
}

export function AdminFilterBar({ children, actions, className }) {
  return (
    <div className={cn("admin-filterbar", className)}>
      <div className="admin-filterbar-fields">{children}</div>
      {actions ? <div className="admin-filterbar-actions">{actions}</div> : null}
    </div>
  );
}

export function AdminDataView({ children, empty, emptyTitle, emptyBody, className }) {
  if (empty) {
    return <AdminEmptyState title={emptyTitle} body={emptyBody} />;
  }
  return <div className={cn("admin-data-view", className)}>{children}</div>;
}

export function AdminStatusBadge({ tone = "neutral", children, className }) {
  return (
    <span className={cn("admin-badge", `admin-badge--${tone}`, className)}>
      {children}
    </span>
  );
}

export function AdminEmptyState({ title = "Sin información", body, action, icon: Icon = Inbox }) {
  return (
    <div className="admin-empty-state" role="status">
      <div className="admin-empty-state-icon"><Icon size={18} aria-hidden /></div>
      <div className="admin-empty-state-title">{title}</div>
      {body ? <p className="admin-empty-state-body">{body}</p> : null}
      {action ? <div className="admin-empty-state-action">{action}</div> : null}
    </div>
  );
}

export function AdminPageState({ loading, error, skeleton = "table", children }) {
  if (loading) {
    return (
      <div className={cn("admin-skeleton-view", `admin-skeleton-view--${skeleton}`)} aria-busy="true">
        <span className="sr-only">Cargando</span>
        {Array.from({ length: skeleton === "overview" ? 8 : 6 }, (_, index) => (
          <div key={index} className="admin-skeleton-block" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="admin-error-state" role="alert">
        <AlertCircle size={18} aria-hidden />
        <span>{error}</span>
      </div>
    );
  }
  return children ?? null;
}

/**
 * Diálogo modal reutilizable del Panel Admin.
 * - ESC / clic en backdrop (configurable) / botón cerrar
 * - Bloqueo de scroll del body
 * - Foco inicial en el botón cerrar
 * - Cuerpo con scroll interno (la tarjeta de página no cambia de tamaño)
 */
export function AdminDialog({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "default",
  destructive = false,
  closeOnBackdrop = true,
  className,
  bodyClassName,
}) {
  const titleId = useId();
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    const t = window.setTimeout(() => closeRef.current?.focus?.(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="admin-dialog-root" role="presentation">
      <button
        type="button"
        className="admin-dialog-backdrop"
        aria-label="Cerrar"
        onClick={closeOnBackdrop ? onClose : undefined}
        tabIndex={closeOnBackdrop ? 0 : -1}
      />
      <section
        className={cn(
          "admin-dialog",
          `admin-dialog--${size}`,
          destructive && "admin-dialog--destructive",
          className,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="admin-dialog-header">
          <div>
            <h2 id={titleId} className="admin-dialog-title">{title}</h2>
            {subtitle ? <p className="admin-dialog-subtitle">{subtitle}</p> : null}
          </div>
          <button
            ref={closeRef}
            type="button"
            className="admin-dialog-close"
            aria-label="Cerrar"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className={cn("admin-dialog-body", bodyClassName)}>{children}</div>
        {footer ? <footer className="admin-dialog-footer">{footer}</footer> : null}
      </section>
    </div>
  );
}

export function AdminKpiCard({ label, value, comparison, description, tone = "neutral" }) {
  return (
    <article className="admin-kpi-card">
      <div className="admin-kpi-card-label">{label}</div>
      <div className="admin-kpi-card-value-row">
        <strong className="admin-kpi-card-value">{value}</strong>
        {comparison ? <AdminStatusBadge tone={tone}>{comparison}</AdminStatusBadge> : null}
      </div>
      {description ? <p className="admin-kpi-card-description">{description}</p> : null}
    </article>
  );
}

export function AdminChartCard({ title, subtitle, action, children, className }) {
  return (
    <AdminCard title={title} subtitle={subtitle} action={action} className={cn("admin-chart-panel", className)}>
      {children}
    </AdminCard>
  );
}

export function AdminTimeline({ items, emptyTitle, emptyBody, renderItem }) {
  if (!items?.length) {
    return <AdminEmptyState title={emptyTitle} body={emptyBody} />;
  }
  return (
    <ol className="admin-timeline">
      {items.map((item, index) => (
        <li key={item.id || index} className="admin-timeline-item">
          <span className="admin-timeline-dot" aria-hidden />
          <div className="admin-timeline-content">{renderItem ? renderItem(item) : item.label}</div>
        </li>
      ))}
    </ol>
  );
}
