type ToastType = "success" | "error" | "info";

export type ToastIconKey =
  | "message"
  | "connection_request"
  | "connection_accepted"
  | "shared_prospect"
  | "follow_up_reminder"
  | "sales_to_process"
  | "scheduled_note"
  | "bell";

export type ToastOptions = {
  /** Mensaje plano (toasts simples success/error/info) */
  message?: string;
  /** Título de notificación enriquecida */
  title?: string;
  /** Cuerpo / segunda línea */
  body?: string;
  type?: ToastType;
  /** `notification` = card con ícono + 2 líneas (Saletse) */
  variant?: "default" | "notification";
  icon?: ToastIconKey | null;
  avatarUrl?: string | null;
  duration?: number;
  href?: string | null;
  onClick?: (() => void) | null;
};

type Handler = (opts: ToastOptions) => void;

let _handler: Handler | null = null;

function emit(opts: ToastOptions) {
  _handler?.(opts);
}

export const toast = {
  success: (msg: string) => emit({ message: msg, type: "success", variant: "default" }),
  error: (msg: string) => emit({ message: msg, type: "error", variant: "default" }),
  info: (msg: string) => emit({ message: msg, type: "info", variant: "default" }),
  /** Toast de notificación in-app (diseño Saletse, 2 líneas, ícono). */
  notify: (opts: ToastOptions) => emit({
    type: "info",
    variant: "notification",
    duration: 5500,
    ...opts,
  }),
  /** Internal: called by <Toaster /> on mount */
  _register(h: Handler) { _handler = h; },
};
