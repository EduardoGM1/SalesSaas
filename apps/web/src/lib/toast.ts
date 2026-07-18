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
  message?: string;
  title?: string;
  body?: string;
  type?: ToastType;
  variant?: "default" | "notification";
  icon?: ToastIconKey | null;
  avatarUrl?: string | null;
  duration?: number;
  href?: string | null;
  onClick?: (() => void) | null;
  /** Si se repite, el Toaster reemplaza el toast existente en vez de apilar. */
  groupKey?: string | null;
};

type Handler = (opts: ToastOptions & { _replaceId?: number | null }) => number;

let _handler: Handler | null = null;
let _nextId = 0;

function emit(opts: ToastOptions & { _replaceId?: number | null }): number {
  if (!_handler) return 0;
  return _handler(opts);
}

export const toast = {
  success: (msg: string, opts?: Pick<ToastOptions, "groupKey" | "duration">) => {
    emit({ message: msg, type: "success", variant: "default", ...opts });
  },
  error: (msg: string, opts?: Pick<ToastOptions, "groupKey" | "duration">) => {
    emit({ message: msg, type: "error", variant: "default", ...opts });
  },
  info: (msg: string, opts?: Pick<ToastOptions, "groupKey" | "duration">) => {
    emit({ message: msg, type: "info", variant: "default", ...opts });
  },
  /** Toast de notificación in-app. Devuelve id para update/agrupación. */
  notify: (opts: ToastOptions): number => emit({
    type: "info",
    variant: "notification",
    duration: 5500,
    ...opts,
  }),
  /** Actualiza un toast existente (agrupación). */
  update: (id: number, opts: ToastOptions): number => emit({
    type: "info",
    variant: "notification",
    duration: 5500,
    ...opts,
    _replaceId: id,
  }),
  _register(h: Handler) { _handler = h; },
  _allocId() { return ++_nextId; },
};
