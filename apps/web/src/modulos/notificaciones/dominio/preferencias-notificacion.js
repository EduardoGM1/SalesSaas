/**
 * Misma regla que API (normalizarPreferenciasNotificacion).
 * Duplicado deliberado en web para no acoplar runtime web→api.
 */

export function normalizarPreferenciasNotificacion(notifications = {}) {
  const n = notifications && typeof notifications === "object" ? notifications : {};
  return {
    messages: n.messages !== false,
    connection_requests: n.connection_requests !== false,
    connection_accepted: n.connection_accepted !== false,
    shared_prospects: n.shared_prospects !== false,
    follow_up_reminders: n.follow_up_reminders !== false,
    sales_to_process: n.sales_to_process === true,
    scheduled_notes: n.scheduled_notes !== false,
  };
}

/** tipo in-app → clave notifications.* */
export const TIPO_A_PREF = {
  mensaje_nuevo: "messages",
  solicitud_contacto: "connection_requests",
  solicitud_aceptada: "connection_accepted",
  expediente_compartido: "shared_prospects",
  cerrador_asignado: "shared_prospects",
  expediente_transferido: "shared_prospects",
  followup_pendiente: "follow_up_reminders",
  venta_pendiente: "sales_to_process",
  nota_programada: "scheduled_notes",
};

export function preferenciaHabilitadaParaTipo(prefs, tipo) {
  const prefKey = TIPO_A_PREF[tipo];
  if (!prefKey) return true;
  return Boolean(prefs[prefKey]);
}
