/** Máximo de toasts visibles a la vez (los más antiguos se descartan). */
export const MAX_TOASTS_VISIBLES = 3;

export function duracionToast(opts) {
  const type = opts.type || "info";
  const variant = opts.variant || "default";
  return opts.duration
    ?? (variant === "notification" ? 5500 : type === "error" ? 4500 : 3000);
}

/** Opciones de toast sin título, cuerpo ni mensaje no se muestran. */
export function toastEsVacio(opts) {
  const title = String(opts?.title || "").trim();
  const body = String(opts?.body || "").trim();
  const message = String(opts?.message || "").trim();
  return !title && !body && !message;
}

export function armarItemToast(opts, id) {
  const title = String(opts?.title || "").trim();
  const body = String(opts?.body || "").trim();
  const message = String(opts?.message || "").trim();
  const type = opts.type || "info";
  const variant = opts.variant || "default";
  return {
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
    groupKey: opts.groupKey || null,
  };
}
