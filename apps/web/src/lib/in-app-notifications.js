import { PushType } from "@salesapp/shared/push/notification-targets.js";
import { getInstallPlatform } from "@/lib/pwa-install.js";
import { playNotificationSound } from "@/lib/notification-sound.js";
import { toast } from "@/lib/toast";
import { useDbStore } from "@/stores/db-store";
import {
  armarNotificacion,
  truncar,
} from "@/lib/notificacion-payload";

const GROUP_WINDOW_MS = 30_000;

/** @type {Map<string, { count: number, timestamp: number, toastId: number, nombre?: string, data: Record<string, unknown> }>} */
const groupRegistry = new Map();

/** Preferencia Configuración → Notificaciones (misma lógica que el API). */
const TIPO_TO_PREF = {
  mensaje_nuevo: "messages",
  solicitud_contacto: "connection_requests",
  solicitud_aceptada: "connection_accepted",
  expediente_compartido: "shared_prospects",
  followup_pendiente: "follow_up_reminders",
  venta_pendiente: "sales_to_process",
  nota_programada: "scheduled_notes",
};

const PUSH_TO_TIPO = {
  [PushType.MESSAGE]: "mensaje_nuevo",
  [PushType.CONNECTION_REQUEST]: "solicitud_contacto",
  [PushType.CONNECTION_ACCEPTED]: "solicitud_aceptada",
  [PushType.SHARED_PROSPECT]: "expediente_compartido",
  [PushType.PROSPECT_SECTION_CHANGED]: "expediente_compartido",
  [PushType.FOLLOW_UP_REMINDER]: "followup_pendiente",
  [PushType.SALES_TO_PROCESS]: "venta_pendiente",
  [PushType.SCHEDULED_NOTE]: "nota_programada",
};

const ICONO_CATEGORIA_TO_TOAST = {
  agenda: "follow_up_reminder",
  ventas: "sales_to_process",
  notas: "scheduled_note",
};

const TIPO_TO_ICON = {
  mensaje_nuevo: "message",
  solicitud_contacto: "connection_request",
  solicitud_aceptada: "connection_accepted",
  expediente_compartido: "shared_prospect",
  followup_pendiente: "follow_up_reminder",
  venta_pendiente: "sales_to_process",
  nota_programada: "scheduled_note",
};

function pruneGroups(now) {
  for (const [k, v] of groupRegistry) {
    if (now - v.timestamp > GROUP_WINDOW_MS) groupRegistry.delete(k);
  }
}

export function getNotificationPrefs() {
  const notifications = useDbStore.getState()?.db?.settings?.notifications ?? {};
  return {
    messages: notifications.messages !== false,
    connection_requests: notifications.connection_requests !== false,
    connection_accepted: notifications.connection_accepted !== false,
    shared_prospects: notifications.shared_prospects !== false,
    follow_up_reminders: notifications.follow_up_reminders !== false,
    sales_to_process: notifications.sales_to_process === true,
    scheduled_notes: notifications.scheduled_notes !== false,
  };
}

/** Filtro de preferencias ANTES de armar payload. */
export function isNotificacionTipoEnabled(tipo) {
  const prefKey = TIPO_TO_PREF[tipo];
  if (!prefKey) return true;
  return Boolean(getNotificationPrefs()[prefKey]);
}

/** @deprecated usar isNotificacionTipoEnabled; bridge PushType → tipo */
export function isNotificationTypeEnabled(pushType) {
  if (!pushType || pushType === PushType.SESSION_REVOKED) return true;
  const tipo = PUSH_TO_TIPO[pushType];
  if (!tipo) return true;
  return isNotificacionTipoEnabled(tipo);
}

function toastIconFromPayload(payload) {
  if (payload.iconoCategoria && ICONO_CATEGORIA_TO_TOAST[payload.iconoCategoria]) {
    return ICONO_CATEGORIA_TO_TOAST[payload.iconoCategoria];
  }
  return TIPO_TO_ICON[payload.tipo] || "bell";
}

function emitToast(payload, { toastId = null, playSound = true, groupKey = null } = {}) {
  const opts = {
    title: payload.titulo,
    body: payload.cuerpo,
    avatarUrl: payload.avatarUrl || null,
    icon: toastIconFromPayload(payload),
    href: payload.rutaDestino,
    duration: 5500,
    groupKey: groupKey || `${payload.tipo}:${payload.entidadId}`,
  };

  const id = toastId != null
    ? toast.update(toastId, opts)
    : toast.notify(opts);

  if (playSound && getInstallPlatform() === "desktop") {
    void playNotificationSound();
  }
  return id;
}

/**
 * Presenta toast desde un NotificacionPayload ya armado (o lo arma desde data).
 * Aplica preferencias → builder → agrupación → toast.
 * @returns {boolean}
 */
export function presentarNotificacion(tipo, data = {}, { playSound = true } = {}) {
  if (typeof window === "undefined") return false;
  if (!isNotificacionTipoEnabled(tipo)) return false;

  const now = Date.now();
  pruneGroups(now);

  let payload = armarNotificacion(tipo, data);
  if (!payload.titulo && !payload.cuerpo) return false;

  // Ventas: agrupar todas en la misma ventana bajo una sola clave.
  const groupKey = tipo === "venta_pendiente"
    ? "venta_pendiente:multiple"
    : `${payload.tipo}:${payload.entidadId}`;
  const existing = groupRegistry.get(groupKey);

  if (existing && now - existing.timestamp < GROUP_WINDOW_MS) {
    existing.count += 1;
    existing.timestamp = now;

    if (tipo === "mensaje_nuevo") {
      const nombre = String(data.nombreRemitente || existing.nombre || "Contacto");
      payload = {
        ...payload,
        cuerpo: `${nombre} te envió ${existing.count} mensajes`,
        agrupada: true,
        cantidadAgrupada: existing.count,
      };
    } else if (tipo === "venta_pendiente") {
      payload = armarNotificacion("venta_pendiente", {
        ...existing.data,
        ...data,
        cantidad: existing.count,
      });
    } else {
      // Otros tipos: reemplazar toast con el payload más reciente (sin apilar).
      payload = armarNotificacion(tipo, { ...existing.data, ...data });
    }

    const id = emitToast(payload, { toastId: existing.toastId, playSound, groupKey });
    existing.toastId = id ?? existing.toastId;
    existing.data = { ...existing.data, ...data };
    return true;
  }

  const toastId = emitToast(payload, { playSound, groupKey });
  groupRegistry.set(groupKey, {
    count: tipo === "venta_pendiente" && Number(data.cantidad) > 1
      ? Number(data.cantidad)
      : 1,
    timestamp: now,
    toastId,
    nombre: data.nombreRemitente ? String(data.nombreRemitente) : undefined,
    data: { ...data },
  });
  return true;
}

/**
 * Bridge legacy: acepta title/body/type PushType (llamadas antiguas).
 * Preferir `presentarNotificacion(tipo, data)`.
 */
export function presentInAppNotification({
  type,
  title,
  body,
  path,
  dedupeKey,
  playSound = true,
  avatarUrl = null,
  /** @type {NotificacionTipo | null} */
  tipo = null,
  data = null,
} = {}) {
  if (data && tipo) {
    return presentarNotificacion(tipo, data, { playSound });
  }

  const mapped = tipo || PUSH_TO_TIPO[type];
  if (!mapped) return false;
  if (!isNotificacionTipoEnabled(mapped)) return false;

  // Fallback mínimo si solo llegan title/body (p. ej. digests sin campos estructurados).
  const fallbackData = buildFallbackData(mapped, { title, body, path, avatarUrl, dedupeKey, type });
  if (!fallbackData) return false;
  return presentarNotificacion(mapped, fallbackData, { playSound });
}

function parsePeerFromMessagesPath(path) {
  if (!path || typeof path !== "string") return null;
  try {
    const u = new URL(path, "https://app.local");
    return u.searchParams.get("with");
  } catch {
    const m = path.match(/[?&]with=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

function buildFallbackData(tipo, { title, body, path, avatarUrl, type }) {
  const t = String(title || "").trim();
  const b = String(body || "").trim();

  switch (tipo) {
    case "mensaje_nuevo": {
      const chatId = parsePeerFromMessagesPath(path) || "unknown";
      // Push nativo: title = nombre, body = mensaje
      return {
        nombreRemitente: t || "Nuevo mensaje",
        mensaje: b || "",
        avatarRemitente: avatarUrl || undefined,
        chatId,
      };
    }
    case "solicitud_contacto":
      return {
        nombreSolicitante: extractNameFromBody(b, t) || "Alguien",
        avatarSolicitante: avatarUrl || undefined,
        solicitudId: path || t || "solicitud",
      };
    case "solicitud_aceptada":
      return {
        nombreContacto: extractNameFromBody(b, t) || "Tu contacto",
        avatarContacto: avatarUrl || undefined,
        contactoId: parsePeerFromMessagesPath(path) || path || "contacto",
        chatId: parsePeerFromMessagesPath(path) || undefined,
      };
    case "expediente_compartido": {
      const quoted = extractQuoted(b);
      const who = String(b || "").match(/^(.+?)\s+(?:te\s+)?compart/i);
      return {
        nombreQuienComparte: who?.[1]?.trim() || "Un contacto",
        nombreCliente: quoted || "un expediente",
        nivelAcceso: extractAccess(b) || "solo lectura",
        avatarQuienComparte: avatarUrl || undefined,
        expedienteId: "shared",
        rutaDestino: path || "/network",
      };
    }
    case "followup_pendiente":
      // PENDIENTE backend: nombreCliente, motivo, fecha, expedienteId en data del push.
      return {
        nombreCliente: b || t || "Follow-up",
        motivo: null,
        fecha: null,
        expedienteId: "followup",
      };
    case "venta_pendiente": {
      // Digest: "Tienes N ventas..." — intentar parsear cantidad.
      const m = b.match(/(\d+)\s+ventas?/i) || t.match(/(\d+)/);
      const cantidad = m ? Number(m[1]) : 1;
      if (cantidad > 1) return { cantidad };
      // PENDIENTE backend: nombreCliente, monto, ventaId para toast unitario rico.
      return {
        cantidad: 1,
        nombreCliente: b || "Venta",
        monto: 0,
        ventaId: "pending",
      };
    }
    case "nota_programada":
      // PENDIENTE backend: nombreCliente, contenidoNota, expedienteId estructurados.
      return {
        nombreCliente: t || "Nota",
        contenidoNota: b || "",
        expedienteId: "nota",
      };
    default:
      return null;
  }
}

function extractNameFromBody(body, title) {
  const m = String(body || "").match(/^(.+?)\s+(quiere|aceptó)/i);
  if (m) return m[1].trim();
  if (title && !/solicitud/i.test(title)) return title;
  return null;
}

function extractQuoted(text) {
  const m = String(text || "").match(/[«"]([^»"]+)[»"]/);
  return m ? m[1] : null;
}

function extractAccess(text) {
  const m = String(text || "").match(/acceso\s+(?:de\s+)?(.+)$/i);
  return m ? m[1].trim() : null;
}

export function presentFromPushNotification(notification) {
  const data = notification?.additionalData || {};
  if (data.type === PushType.SESSION_REVOKED) return false;

  const tipo = PUSH_TO_TIPO[data.type];
  if (!tipo) return false;
  if (!isNotificacionTipoEnabled(tipo)) return false;

  return presentInAppNotification({
    type: data.type,
    tipo,
    title: notification?.title || "",
    body: notification?.body || "",
    path: data.path || null,
  });
}

export {
  armarNotificacion,
  truncar,
  PushType,
  TIPO_TO_PREF,
  PUSH_TO_TIPO,
};
