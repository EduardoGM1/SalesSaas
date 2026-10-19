/**
 * Datos mínimos para armar una notificación in-app cuando solo llegan title/body/path
 * (push nativo o digests sin campos estructurados).
 */

function peerDesdeRutaMensajes(path) {
  if (!path || typeof path !== "string") return null;
  try {
    const u = new URL(path, "https://app.local");
    return u.searchParams.get("with");
  } catch {
    const m = path.match(/[?&]with=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

function conversacionDesdeRutaMensajes(path) {
  if (!path || typeof path !== "string") return null;
  try {
    const u = new URL(path, "https://app.local");
    return u.searchParams.get("conversation");
  } catch {
    const m = path.match(/[?&]conversation=([^&]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

function expedienteDesdeRutaClients(path) {
  if (!path || typeof path !== "string") return null;
  try {
    const u = new URL(path, "https://app.local");
    const m = u.pathname.match(/^\/clients\/([^/]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    const m = String(path).match(/\/clients\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }
}

function nombreDesdeCuerpo(body, title) {
  const m = String(body || "").match(/^(.+?)\s+(quiere|aceptó)/i);
  if (m) return m[1].trim();
  if (title && !/solicitud/i.test(title)) return title;
  return null;
}

function textoEntreComillas(text) {
  const m = String(text || "").match(/[«"]([^»"]+)[»"]/);
  return m ? m[1] : null;
}

function nivelAccesoDesdeTexto(text) {
  const m = String(text || "").match(/acceso\s+(?:de\s+)?(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * @param {string} tipo tipo in-app
 * @param {{ title?: string, body?: string, path?: string | null, avatarUrl?: string | null }} entrada
 * @returns {Record<string, unknown> | null}
 */
export function datosRespaldoDesdePush(tipo, { title, body, path, avatarUrl }) {
  const t = String(title || "").trim();
  const b = String(body || "").trim();

  switch (tipo) {
    case "mensaje_nuevo": {
      const conversationId = conversacionDesdeRutaMensajes(path);
      const chatId = peerDesdeRutaMensajes(path) || "unknown";
      // Push nativo: title = nombre, body = mensaje
      return {
        nombreRemitente: t || "Nuevo mensaje",
        mensaje: b || "",
        avatarRemitente: avatarUrl || undefined,
        chatId,
        conversationId: conversationId || undefined,
        rutaDestino: path || undefined,
      };
    }
    case "cerrador_asignado":
      return {
        cuerpo: b || t || "Hay una actualización en los participantes del expediente",
        expedienteId: expedienteDesdeRutaClients(path) || "expediente",
        rutaDestino: path || "/clients",
        reasignado: /reasign/i.test(t || b || ""),
      };
    case "solicitud_contacto":
      return {
        nombreSolicitante: nombreDesdeCuerpo(b, t) || "Alguien",
        avatarSolicitante: avatarUrl || undefined,
        solicitudId: path || t || "solicitud",
      };
    case "solicitud_aceptada":
      return {
        nombreContacto: nombreDesdeCuerpo(b, t) || "Tu contacto",
        avatarContacto: avatarUrl || undefined,
        contactoId: peerDesdeRutaMensajes(path) || path || "contacto",
        chatId: peerDesdeRutaMensajes(path) || undefined,
      };
    case "expediente_compartido": {
      const quoted = textoEntreComillas(b);
      const who = String(b || "").match(/^(.+?)\s+(?:te\s+)?compart/i);
      return {
        nombreQuienComparte: who?.[1]?.trim() || "Un contacto",
        nombreCliente: quoted || "un expediente",
        nivelAcceso: nivelAccesoDesdeTexto(b) || "solo lectura",
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
    case "respuesta_soporte": {
      let ticketId = "support";
      try {
        const u = new URL(path || "", "https://app.local");
        ticketId = u.searchParams.get("supportTicket") || ticketId;
      } catch {
        // ignore
      }
      const frag = b.replace(/^Soporte respondió:\s*/i, "").trim() || b;
      return { ticketId, fragmento: frag };
    }
    default:
      return null;
  }
}
