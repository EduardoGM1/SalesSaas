/** Tipos de notificación push (deep link en la SPA). */
export const PushType = {
  MESSAGE: "message",
  CONNECTION_REQUEST: "connection_request",
  CONNECTION_ACCEPTED: "connection_accepted",
  SHARED_PROSPECT: "shared_prospect",
};

export function networkPath() {
  return "/network";
}

export function messagePath(senderId) {
  return `/messages?with=${encodeURIComponent(String(senderId))}`;
}

export function contactPath(contactId) {
  return `/red/contacto/${encodeURIComponent(String(contactId))}`;
}

export function sharedProspectPath(ownerId, prospectId) {
  return `/red/contacto/${encodeURIComponent(String(ownerId))}/expediente/${encodeURIComponent(String(prospectId))}`;
}

export function pushUrl(origin, path) {
  const base = String(origin || "").replace(/\/$/, "");
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalized}`;
}

/**
 * Ruta interna de la app a partir del payload de OneSignal (path, url o type).
 * @param {Record<string, unknown>} payload
 * @returns {string | null}
 */
export function resolvePushPathFromPayload(payload = {}) {
  const path = payload.path;
  if (typeof path === "string" && path.startsWith("/")) {
    return path;
  }

  const url = payload.url || payload.launchUrl || payload.launchURL;
  if (url) {
    try {
      const u = new URL(String(url));
      const target = `${u.pathname}${u.search}${u.hash}`;
      if (target && target !== "/") return target;
    } catch {
      // URL inválida.
    }
  }

  switch (payload.type) {
    case PushType.CONNECTION_REQUEST:
      return networkPath();
    case PushType.CONNECTION_ACCEPTED:
      return networkPath();
    default:
      return null;
  }
}
