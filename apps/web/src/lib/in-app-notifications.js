import { getInstallPlatform } from "@/lib/pwa-install.js";
import { showDesktopLocalNotification } from "@/lib/desktop-notifications.js";
import { playNotificationSound } from "@/lib/notification-sound.js";
import { toast } from "@/lib/toast";
import { useDbStore } from "@/stores/db-store";
import {
  armarNotificacion,
  truncar,
} from "@/lib/notificacion-payload";
import {
  PushType,
  PUSH_A_TIPO,
  TIPO_A_PREF,
  normalizarPreferenciasNotificacion,
  preferenciaHabilitadaParaTipo,
  datosRespaldoDesdePush,
  VENTANA_AGRUPACION_MS,
  claveAgrupacion,
  opcionesToastDesdePayload,
} from "@/modulos/notificaciones/index.js";

/** @type {Map<string, { count: number, timestamp: number, toastId: number, nombre?: string, data: Record<string, unknown> }>} */
const groupRegistry = new Map();

const TIPO_TO_PREF = TIPO_A_PREF;
const PUSH_TO_TIPO = PUSH_A_TIPO;

function pruneGroups(now) {
  for (const [k, v] of groupRegistry) {
    if (now - v.timestamp > VENTANA_AGRUPACION_MS) groupRegistry.delete(k);
  }
}

export function getNotificationPrefs() {
  const notifications = useDbStore.getState()?.db?.settings?.notifications ?? {};
  return normalizarPreferenciasNotificacion(notifications);
}

/** Filtro de preferencias ANTES de armar payload. */
export function isNotificacionTipoEnabled(tipo) {
  return preferenciaHabilitadaParaTipo(getNotificationPrefs(), tipo);
}

/** @deprecated usar isNotificacionTipoEnabled; bridge PushType → tipo */
export function isNotificationTypeEnabled(pushType) {
  if (!pushType || pushType === PushType.SESSION_REVOKED) return true;
  const tipo = PUSH_TO_TIPO[pushType];
  if (!tipo) return true;
  return isNotificacionTipoEnabled(tipo);
}

function emitToast(payload, { toastId = null, playSound = true, groupKey = null } = {}) {
  const opts = opcionesToastDesdePayload(payload, groupKey);

  const id = toastId != null
    ? toast.update(toastId, opts)
    : toast.notify(opts);

  if (playSound && getInstallPlatform() === "desktop") {
    void playNotificationSound();
    // Si la pestaña está en segundo plano: Notification API local (sin OneSignal/FCM).
    showDesktopLocalNotification({
      title: payload.titulo,
      body: payload.cuerpo,
      href: payload.rutaDestino || null,
    });
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

  const groupKey = claveAgrupacion(tipo, payload);
  const existing = groupRegistry.get(groupKey);

  if (existing && now - existing.timestamp < VENTANA_AGRUPACION_MS) {
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
  const fallbackData = datosRespaldoDesdePush(mapped, { title, body, path, avatarUrl });
  if (!fallbackData) return false;
  return presentarNotificacion(mapped, fallbackData, { playSound });
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
