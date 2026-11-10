import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { MoreVertical } from "lucide-react";

const MENU_MIN_WIDTH = 200;
const VIEW_PAD = 8;

/**
 * Menú kebab (⋮) para acciones de fila en tablas admin.
 * @param {{ label: string, items: Array<{ id: string, label: string, icon?: import("react").ReactNode, href?: string, onSelect?: () => void, danger?: boolean, disabled?: boolean }> }} props
 */
export function AdminOverflowMenu({ label, items }) {
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const visibleItems = (items || []).filter(Boolean);

  useLayoutEffect(() => {
    if (!open || !visibleItems.length) return;
    const btn = btnRef.current;
    const menu = menuRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const menuW = menu?.offsetWidth || MENU_MIN_WIDTH;
    const menuH = menu?.offsetHeight || visibleItems.length * 40 + 16;
    let left = rect.right - menuW;
    let top = rect.bottom + 4;
    if (left < VIEW_PAD) left = VIEW_PAD;
    if (left + menuW > window.innerWidth - VIEW_PAD) {
      left = Math.max(VIEW_PAD, window.innerWidth - menuW - VIEW_PAD);
    }
    if (top + menuH > window.innerHeight - VIEW_PAD) {
      top = Math.max(VIEW_PAD, rect.top - menuH - 4);
    }
    setCoords({ top, left });
  }, [open, visibleItems.length]);

  useEffect(() => {
    if (!open) return undefined;
    const placeMenu = () => {
      const btn = btnRef.current;
      const menu = menuRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const menuW = menu?.offsetWidth || MENU_MIN_WIDTH;
      const menuH = menu?.offsetHeight || 160;
      let left = rect.right - menuW;
      let top = rect.bottom + 4;
      if (left < VIEW_PAD) left = VIEW_PAD;
      if (left + menuW > window.innerWidth - VIEW_PAD) {
        left = Math.max(VIEW_PAD, window.innerWidth - menuW - VIEW_PAD);
      }
      if (top + menuH > window.innerHeight - VIEW_PAD) {
        top = Math.max(VIEW_PAD, rect.top - menuH - 4);
      }
      setCoords({ top, left });
    };
    const onPointer = (e) => {
      const t = e.target;
      if (btnRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  if (!visibleItems.length) return null;

  const close = () => setOpen(false);

  return (
    <div className="admin-overflow">
      <button
        ref={btnRef}
        type="button"
        className="icon-btn admin-overflow-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreVertical size={16} aria-hidden />
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              className="admin-overflow-menu"
              role="menu"
              aria-label={label}
              style={{ top: coords.top, left: coords.left }}
            >
              {visibleItems.map((item) => {
                const className = [
                  "admin-overflow-item",
                  item.danger ? "is-danger" : "",
                  item.disabled ? "is-disabled" : "",
                ].filter(Boolean).join(" ");
                const content = (
                  <>
                    {item.icon ? <span className="admin-overflow-item-icon">{item.icon}</span> : null}
                    <span>{item.label}</span>
                  </>
                );
                if (item.href && !item.disabled) {
                  return (
                    <Link
                      key={item.id}
                      role="menuitem"
                      to={item.href}
                      className={className}
                      onClick={close}
                    >
                      {content}
                    </Link>
                  );
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    className={className}
                    disabled={item.disabled}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onSelect?.();
                      close();
                    }}
                  >
                    {content}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
