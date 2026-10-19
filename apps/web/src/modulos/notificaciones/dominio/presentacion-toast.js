/** Ventana en la que notificaciones con la misma clave se agrupan en un solo toast. */
export const VENTANA_AGRUPACION_MS = 30_000;

const ICONO_CATEGORIA_A_TOAST = {
  agenda: "follow_up_reminder",
  ventas: "sales_to_process",
  notas: "scheduled_note",
};

const TIPO_A_ICONO = {
  mensaje_nuevo: "message",
  solicitud_contacto: "connection_request",
  solicitud_aceptada: "connection_accepted",
  expediente_compartido: "shared_prospect",
  cerrador_asignado: "shared_prospect",
  expediente_transferido: "shared_prospect",
  followup_pendiente: "follow_up_reminder",
  venta_pendiente: "sales_to_process",
  nota_programada: "scheduled_note",
};

/** Tono visual del icono del toast (clase `tone-*`). */
export const TONO_POR_ICONO = {
  message: "blue",
  connection_request: "teal",
  connection_accepted: "green",
  shared_prospect: "purple",
  follow_up_reminder: "blue",
  sales_to_process: "green",
  scheduled_note: "teal",
  agenda: "blue",
  ventas: "green",
  notas: "teal",
  bell: "blue",
};

export function iconoToastDesdePayload(payload) {
  if (payload.iconoCategoria && ICONO_CATEGORIA_A_TOAST[payload.iconoCategoria]) {
    return ICONO_CATEGORIA_A_TOAST[payload.iconoCategoria];
  }
  return TIPO_A_ICONO[payload.tipo] || "bell";
}

/** Ventas: todas en la misma ventana bajo una sola clave. */
export function claveAgrupacion(tipo, payload) {
  return tipo === "venta_pendiente"
    ? "venta_pendiente:multiple"
    : `${payload.tipo}:${payload.entidadId}`;
}

export function opcionesToastDesdePayload(payload, groupKey = null) {
  return {
    title: payload.titulo,
    body: payload.cuerpo,
    avatarUrl: payload.avatarUrl || null,
    icon: iconoToastDesdePayload(payload),
    href: payload.rutaDestino,
    duration: 5500,
    groupKey: groupKey || `${payload.tipo}:${payload.entidadId}`,
  };
}
