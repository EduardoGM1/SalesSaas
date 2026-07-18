/**
 * Estructura aprobada de notificaciones in-app (desktop toast).
 * Templates exactos por tipo — no alterar titulo/cuerpo sin acuerdo de producto.
 */

export type NotificacionTipo =
  | "mensaje_nuevo"
  | "solicitud_contacto"
  | "solicitud_aceptada"
  | "expediente_compartido"
  | "followup_pendiente"
  | "venta_pendiente"
  | "nota_programada"
  | "respuesta_soporte";

export type NotificacionPayload = {
  tipo: NotificacionTipo;
  titulo: string;
  cuerpo: string;
  avatarUrl?: string;
  /** Ícono de categoría cuando no hay avatar: agenda | ventas | notas */
  iconoCategoria?: string;
  rutaDestino: string;
  entidadId: string;
  agrupada?: boolean;
  cantidadAgrupada?: number;
};

/** Helper de truncado — reutilizar en todos los tipos con texto libre. */
export const truncar = (texto: string, max = 45) => {
  const t = String(texto ?? "");
  return t.length > max ? `${t.slice(0, max).trimEnd()}...` : t;
};

/**
 * Armado de payload por tipo.
 * Rutas apuntan a paths reales de la SPA (equivalentes a los del spec).
 */
export function armarNotificacion(
  tipo: NotificacionPayload["tipo"],
  data: Record<string, unknown> = {},
): NotificacionPayload {
  switch (tipo) {
    case "mensaje_nuevo":
      return {
        tipo,
        titulo: "Nuevo mensaje",
        cuerpo: `${data.nombreRemitente}: ${truncar(String(data.mensaje ?? ""))}`,
        avatarUrl: data.avatarRemitente ? String(data.avatarRemitente) : undefined,
        // spec: /mensajes/:chatId → SPA: /messages?with=
        rutaDestino: `/messages?with=${encodeURIComponent(String(data.chatId ?? ""))}`,
        entidadId: String(data.chatId ?? ""),
      };

    case "solicitud_contacto":
      return {
        tipo,
        titulo: "Solicitud de contacto",
        cuerpo: `${data.nombreSolicitante} quiere agregarte a su red`,
        avatarUrl: data.avatarSolicitante ? String(data.avatarSolicitante) : undefined,
        // spec: /red/solicitudes → SPA: /network
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
        // Preferir ruta compartida si viene; si no, expediente propio.
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
        // spec: /agenda?fecha= → SPA: agenda es index /
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

    default: {
      const _exhaustive: never = tipo;
      throw new Error(`Tipo de notificación no soportado: ${_exhaustive}`);
    }
  }
}
