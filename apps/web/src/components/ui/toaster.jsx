import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/lib/toast";

const MAX_VISIBLE = 3;

/**
 * @typedef {{ id: number, msg: string, type: string, href?: string | null, onClick?: (() => void) | null }} Item
 */

let _id = 0;

export function Toaster() {
  const navigate = useNavigate();
  const [items, setItems] = useState(/** @type {Item[]} */ ([]));

  useEffect(() => {
    toast._register((opts) => {
      const message = String(opts?.message || "").trim();
      if (!message) return;
      const type = opts.type || "info";
      const id = ++_id;
      const href = opts.href || null;
      const onClick = opts.onClick || null;
      setItems((prev) => {
        const next = [...prev, { id, msg: message, type, href, onClick }];
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
      });
      const duration = opts.duration
        ?? (type === "error" ? 4500 : type === "info" ? 5500 : 3000);
      window.setTimeout(() => {
        setItems((p) => p.filter((i) => i.id !== id));
      }, duration);
    });
  }, []);

  if (!items.length) return null;

  return (
    <div className="toaster">
      {items.map((item) => {
        const clickable = Boolean(item.href || item.onClick);
        return (
          <div
            key={item.id}
            role={clickable ? "button" : "status"}
            tabIndex={clickable ? 0 : undefined}
            className={`toast-item toast-${item.type}${clickable ? " toast-item--action" : ""}`}
            onClick={() => {
              if (item.onClick) {
                item.onClick();
                return;
              }
              if (item.href) navigate(item.href);
            }}
            onKeyDown={(e) => {
              if (!clickable) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (item.onClick) item.onClick();
                else if (item.href) navigate(item.href);
              }
            }}
          >
            {item.msg}
          </div>
        );
      })}
    </div>
  );
}
