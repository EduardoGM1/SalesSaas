type ToastType = "success" | "error" | "info";

export type ToastOptions = {
  message: string;
  type?: ToastType;
  /** ms visibles; default según tipo */
  duration?: number;
  /** Ruta SPA al hacer clic */
  href?: string | null;
  onClick?: (() => void) | null;
};

type Handler = (opts: ToastOptions) => void;

let _handler: Handler | null = null;

function emit(opts: ToastOptions) {
  _handler?.(opts);
}

export const toast = {
  success: (msg: string) => emit({ message: msg, type: "success" }),
  error: (msg: string) => emit({ message: msg, type: "error" }),
  info: (msg: string) => emit({ message: msg, type: "info" }),
  /** Toast enriquecido (notificaciones in-app, acción, duración). */
  notify: (opts: ToastOptions) => emit({ type: "info", duration: 5500, ...opts }),
  /** Internal: called by <Toaster /> on mount */
  _register(h: Handler) { _handler = h; },
};
