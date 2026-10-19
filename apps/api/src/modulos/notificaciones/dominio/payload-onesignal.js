/**
 * Cuerpo JSON de notificación OneSignal (sin fetch).
 */
import { construirEtiquetaPush } from "./etiqueta-push.js";

/**
 * @param {string} appId
 * @param {{ title: string, body: string, url: string, path?: string, type?: string|null, tag?: string, sendAfter?: string }} msg
 */
export function construirPayloadMensajeOnesignal(appId, { title, body, url, path, type, tag, sendAfter }) {
  const appPath = path || "/";
  const topic = construirEtiquetaPush(tag || type || "push");
  const payload = {
    app_id: appId,
    headings: { en: title, es: title },
    contents: { en: body, es: body },
    url,
    // Mismos campos que mensajes/contactos (topic ≤64).
    web_push_topic: topic,
    collapse_id: topic,
    data: { url, path: appPath, type: type || null },
  };
  if (sendAfter) payload.send_after = sendAfter;
  return payload;
}
