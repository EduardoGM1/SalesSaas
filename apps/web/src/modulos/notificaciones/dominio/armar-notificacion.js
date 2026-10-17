/**
 * Armado puro de payload in-app (templates de producto).
 * Sin toast, SW ni storage.
 */

export function truncar(texto, max = 45) {
  const t = String(texto ?? "");
  return t.length > max ? `${t.slice(0, max).trimEnd()}...` : t;
}

export function armarNotificacion(tipo, data = {}) {
  switch (tipo) {
    case "mensaje_nuevo":
      return {
        tipo,
        titulo: "Nuevo mensaje",
        cuerpo: `${data.nombreRemitente}: ${truncar(String(data.mensaje ?? ""))}`,
        avatarUrl: data.avatarRemitente ? String(data.avatarRemitente) : undefined,
        rutaDestino: data.rutaDestino
          ? String(data.rutaDestino)
          : data.conversationId
            ? `/messages?scope=team&conversation=${encodeURIComponent(String(data.conversationId))}`
            : `/messages?with=${encodeURIComponent(String(data.chatId ?? ""))}`,
        entidadId: String(data.conversationId ?? data.chatId ?? ""),
      };

    case "solicitud_contacto":
      return {
        tipo,
        titulo: "Solicitud de contacto",
        cuerpo: `${data.nombreSolicitante} quiere agregarte a su red`,
        avatarUrl: data.avatarSolicitante ? String(data.avatarSolicitante) : undefined,
        rutaDestino: "/network",
        entidadId: String(data.solicitudId ?? ""),
      };

    case "solicitud_aceptada": {
      const chatId = data.chatId ?? data.contactoId;
      return {
        tipo,
        titulo: "Solicitud aceptada",
        cuerpo: `${data.nombreContacto} aceptó tu solicitud de contacto`,
        avatarUrl: data.avatarContacto ? String(data.avatarContacto) : undefined,
        rutaDestino: `/messages?with=${encodeURIComponent(String(chatId ?? ""))}`,
        entidadId: String(data.contactoId ?? chatId ?? ""),
      };
    }

    case "expediente_compartido":
      return {
        tipo,
        titulo: "Expediente compartido",
        cuerpo: `${data.nombreQuienComparte} te compartió el expediente "${data.nombreCliente}" con acceso de ${data.nivelAcceso}`,
        avatarUrl: data.avatarQuienComparte ? String(data.avatarQuienComparte) : undefined,
        rutaDestino: data.rutaDestino
          ? String(data.rutaDestino)
          : `/clients/${encodeURIComponent(String(data.expedienteId ?? ""))}`,
        entidadId: String(data.expedienteId ?? ""),
      };

    case "cerrador_asignado":
      return {
        tipo,
        titulo: data.reasignado ? "Expediente reasignado" : "Cerrador asignado",
        cuerpo: String(data.cuerpo || "Hay una actualización en los participantes del expediente"),
        rutaDestino: data.rutaDestino
          ? String(data.rutaDestino)
          : `/clients/${encodeURIComponent(String(data.expedienteId ?? ""))}`,
        entidadId: String(data.expedienteId ?? ""),
      };

    case "followup_pendiente":
      return {
        tipo,
        titulo: "Follow-up pendiente",
        cuerpo: data.motivo
          ? `${data.nombreCliente} — ${truncar(String(data.motivo), 40)}`
          : String(data.nombreCliente ?? ""),
        iconoCategoria: "agenda",
        rutaDestino: data.fecha ? `/?fecha=${encodeURIComponent(String(data.fecha))}` : "/",
        entidadId: String(data.expedienteId ?? ""),
      };

    case "venta_pendiente": {
      const cantidad = Number(data.cantidad) || 0;
      if (cantidad > 1) {
        return {
          tipo,
          titulo: `${cantidad} ventas pendientes`,
          cuerpo: `Tienes ${cantidad} ventas por procesar`,
          iconoCategoria: "ventas",
          rutaDestino: "/sales",
          entidadId: "multiple",
          agrupada: true,
          cantidadAgrupada: cantidad,
        };
      }
      const monto = Number(data.monto) || 0;
      return {
        tipo,
        titulo: "Venta pendiente",
        cuerpo: `${data.nombreCliente} — USD ${monto.toLocaleString("en-US")}`,
        iconoCategoria: "ventas",
        rutaDestino: data.ventaId
          ? `/sales?venta=${encodeURIComponent(String(data.ventaId))}`
          : "/sales",
        entidadId: String(data.ventaId ?? ""),
      };
    }

    case "nota_programada":
      return {
        tipo,
        titulo: "Nota programada",
        cuerpo: `${data.nombreCliente}: ${truncar(String(data.contenidoNota ?? ""))}`,
        iconoCategoria: "notas",
        rutaDestino: `/clients/${encodeURIComponent(String(data.expedienteId ?? ""))}`,
        entidadId: String(data.expedienteId ?? ""),
      };

    case "respuesta_soporte":
      return {
        tipo,
        titulo: "Respuesta de soporte",
        cuerpo: data.fragmento
          ? `Soporte respondió: ${truncar(String(data.fragmento), 80)}`
          : "Soporte respondió a tu solicitud",
        iconoCategoria: "notas",
        rutaDestino: data.ticketId
          ? `/settings?supportTicket=${encodeURIComponent(String(data.ticketId))}`
          : "/settings",
        entidadId: String(data.ticketId ?? data.replyId ?? ""),
      };

    default:
      throw new Error(`Tipo de notificación no soportado: ${tipo}`);
  }
}
