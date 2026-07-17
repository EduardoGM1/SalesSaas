import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  MessageSquare,
  UserPlus,
  CheckCircle2,
  FolderOpen,
  CalendarClock,
  CircleDollarSign,
  StickyNote,
  Bell,
} from "lucide-react";
import { toast } from "@/lib/toast";

const MAX_VISIBLE = 3;

const ICONS = {
  message: MessageSquare,
  connection_request: UserPlus,
  connection_accepted: CheckCircle2,
  shared_prospect: FolderOpen,
  follow_up_reminder: CalendarClock,
  sales_to_process: CircleDollarSign,
  scheduled_note: StickyNote,
  agenda: CalendarClock,
  ventas: CircleDollarSign,
  notas: StickyNote,
  bell: Bell,
};

const TONE_BY_ICON = {
  message: "blue",
  connection_request: "teal",
  connection_accepted: "green",
  shared_prospect: "purple",
  follow_up_reminder: "blue",
  sales_to_process: "green",
  scheduled_note: "teal",
  agenda: "blue",
  ventas: "green",
  notas: "teal",
  bell: "blue",
};

/**
 * @typedef {{
 *   id: number,
 *   msg: string,
 *   title: string,
 *   body: string,
 *   type: string,
 *   variant: string,
 *   icon: string | null,
 *   avatarUrl: string | null,
 *   href?: string | null,
 *   onClick?: (() => void) | null,
 *   groupKey?: string | null,
 *   timer?: number,
 * }} Item
 */

export function Toaster() {
  const navigate = useNavigate();
  const [items, setItems] = useState(/** @type {Item[]} */ ([]));

  useEffect(() => {
    toast._register((opts) => {
      const title = String(opts?.title || "").trim();
      const body = String(opts?.body || "").trim();
      const message = String(opts?.message || "").trim();
      if (!title && !body && !message) return 0;

      const type = opts.type || "info";
      const variant = opts.variant || "default";
      const replaceId = opts._replaceId || null;
      const groupKey = opts.groupKey || null;
      let id = replaceId || toast._allocId();
      const duration = opts.duration
        ?? (variant === "notification" ? 5500 : type === "error" ? 4500 : 3000);

      const item = {
        id,
        msg: message || [title, body].filter(Boolean).join(" — "),
        title: title || (variant === "notification" ? message : ""),
        body: body || "",
        type,
        variant,
        icon: opts.icon || null,
        avatarUrl: opts.avatarUrl || null,
        href: opts.href || null,
        onClick: opts.onClick || null,
        groupKey,
      };

      setItems((prev) => {
        let next = [...prev];
        const byId = replaceId ? next.findIndex((i) => i.id === replaceId) : -1;
        const byGroup = groupKey && byId < 0
          ? next.findIndex((i) => i.groupKey === groupKey)
          : -1;
        const idx = byId >= 0 ? byId : byGroup;

        if (idx >= 0) {
          const old = next[idx];
          id = old.id;
          if (old.timer) window.clearTimeout(old.timer);
          const timer = window.setTimeout(() => {
            setItems((p) => p.filter((i) => i.id !== old.id));
          }, duration);
          next[idx] = { ...item, id: old.id, timer };
          return next;
        }

        const timer = window.setTimeout(() => {
          setItems((p) => p.filter((i) => i.id !== id));
        }, duration);
        next = [...next, { ...item, id, timer }];
        return next.length > MAX_VISIBLE ? next.slice(-MAX_VISIBLE) : next;
      });

      return id;
    });
  }, []);

  if (!items.length) return null;

  return (
    <div className="toaster">
      {items.map((item) => {
        const clickable = Boolean(item.href || item.onClick);
        const activate = () => {
          if (item.onClick) item.onClick();
          else if (item.href) navigate(item.href);
        };

        if (item.variant === "notification") {
          const Icon = ICONS[item.icon] || Bell;
          const tone = TONE_BY_ICON[item.icon] || "blue";
          return (
            <div
              key={item.id}
              role={clickable ? "button" : "status"}
              tabIndex={clickable ? 0 : undefined}
              className={`toast-card toast-card--${item.type}${clickable ? " toast-card--action" : ""}`}
              onClick={clickable ? activate : undefined}
              onKeyDown={(e) => {
                if (!clickable) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  activate();
                }
              }}
            >
              {item.avatarUrl ? (
                <img src={item.avatarUrl} alt="" className="toast-card-avatar" />
              ) : (
                <div className={`toast-card-icon tone-${tone}`} aria-hidden>
                  <Icon size={18} strokeWidth={2.1} />
                </div>
              )}
              <div className="toast-card-copy">
                <div className="toast-card-title">{item.title || item.msg}</div>
                {item.body ? <div className="toast-card-body">{item.body}</div> : null}
              </div>
            </div>
          );
        }

        return (
          <div
            key={item.id}
            role={clickable ? "button" : "status"}
            tabIndex={clickable ? 0 : undefined}
            className={`toast-item toast-${item.type}${clickable ? " toast-item--action" : ""}`}
            onClick={clickable ? activate : undefined}
            onKeyDown={(e) => {
              if (!clickable) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                activate();
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
