/** Tipos de notificación push (deep link en la SPA). */
export const PushType = {
  MESSAGE: "message",
  CONNECTION_REQUEST: "connection_request",
  CONNECTION_ACCEPTED: "connection_accepted",
  SHARED_PROSPECT: "shared_prospect",
  PROSPECT_SECTION_CHANGED: "prospect_section_changed",
  FOLLOW_UP_REMINDER: "follow_up_reminder",
  SALES_TO_PROCESS: "sales_to_process",
  SCHEDULED_NOTE: "scheduled_note",
  /** Logout en otro dispositivo: forzar cierre local / ir a login. */
  SESSION_REVOKED: "session_revoked",
  /** Respuesta del equipo de soporte a un ticket. */
  SUPPORT_REPLY: "respuesta_soporte",
};

export function networkPath() {
  return "/network";
}

export function calendarPath() {
  return "/";
}

export function salesPath() {
  return "/sales";
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

export function sharedProspectSectionPath(ownerId, prospectId, section) {
  const base = sharedProspectPath(ownerId, prospectId);
  if (section && section !== "detail" && ["survey", "vacaciones", "worksheet"].includes(section)) {
    return `${base}/${section}`;
  }
  return base;
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
    case PushType.SESSION_REVOKED:
      return "/login";
    case PushType.CONNECTION_REQUEST:
      return networkPath();
    case PushType.CONNECTION_ACCEPTED:
      return networkPath();
    case PushType.FOLLOW_UP_REMINDER:
    case PushType.SCHEDULED_NOTE:
      return calendarPath();
    case PushType.SALES_TO_PROCESS:
      return salesPath();
    case PushType.SUPPORT_REPLY:
      return typeof payload.path === "string" ? payload.path : "/settings";
    case PushType.PROSPECT_SECTION_CHANGED:
    case PushType.SHARED_PROSPECT:
      return typeof payload.path === "string" ? payload.path : null;
    default:
      return null;
  }
}
