import { useEffect } from "react";

/**
 * Panel lateral para flujos de administración tenant (p. ej. delegación de permisos).
 */
export function AdminSidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 440,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="admin-side-panel-root" role="presentation">
      <button
        type="button"
        className="admin-side-panel-backdrop"
        aria-label="Cerrar panel"
        onClick={onClose}
      />
      <aside
        className="admin-side-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-side-panel-title"
        style={{ "--admin-side-panel-width": `${width}px` }}
      >
        <header className="admin-side-panel-header">
          <div>
            <h2 id="admin-side-panel-title" className="admin-side-panel-title">{title}</h2>
            {subtitle ? <p className="admin-side-panel-sub">{subtitle}</p> : null}
          </div>
          <button type="button" className="admin-side-panel-close" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </header>
        <div className="admin-side-panel-body">{children}</div>
        {footer ? <footer className="admin-side-panel-footer">{footer}</footer> : null}
      </aside>
    </div>
  );
}
