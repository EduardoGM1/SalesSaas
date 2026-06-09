type Handler = (msg: string, resolve: (ok: boolean) => void) => void;

let _handler: Handler | null = null;

export function confirmDialog(msg: string): Promise<boolean> {
  if (!_handler) {
    if (typeof window === "undefined") return Promise.resolve(false);
    return Promise.resolve(window.confirm(msg));
  }
  return new Promise((resolve) => _handler!(msg, resolve));
}

/** Internal: called by <ConfirmDialog /> on mount */
export function _registerConfirm(h: Handler) { _handler = h; }
