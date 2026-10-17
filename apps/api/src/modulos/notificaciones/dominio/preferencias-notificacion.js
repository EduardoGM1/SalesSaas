/**
 * Reglas de preferencias profiles.settings.notifications.*
 * Misma semántica en API y web (defaults on excepto sales_to_process).
 */

/** @param {Record<string, unknown>|null|undefined} notifications */
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

/**
 * ¿El digest operativo debe omitirse por prefs apagadas?
 * @param {ReturnType<typeof normalizarPreferenciasNotificacion>} prefs
 */
export function digestOmitidoPorPrefs(prefs) {
  return !prefs.follow_up_reminders && !prefs.sales_to_process && !prefs.scheduled_notes;
}

/**
 * Pref check previo a encolar scheduled_push_jobs.
 * @returns {"prefs_off"|null}
 */
export function omitirPorPrefsRecordatorio(prefs, { esFollow, esNota }) {
  if (esFollow && !prefs.follow_up_reminders) return "prefs_off";
  if (esNota && !prefs.scheduled_notes) return "prefs_off";
  return null;
}
