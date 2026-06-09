type ToastType = "success" | "error" | "info";
type Handler = (msg: string, type: ToastType) => void;

let _handler: Handler | null = null;

export const toast = {
  success: (msg: string) => _handler?.(msg, "success"),
  error: (msg: string) => _handler?.(msg, "error"),
  info: (msg: string) => _handler?.(msg, "info"),
  /** Internal: called by <Toaster /> on mount */
  _register(h: Handler) { _handler = h; },
};
