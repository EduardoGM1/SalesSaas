/**
 * Adaptador legacy: reexporta dominio puro (Tramo B).
 * Contratos: extractReminderTime / collectReminders — sin renombrar.
 */
export {
  extraerHoraRecordatorio as extractReminderTime,
  construirRecordatorios as collectReminders,
} from "../modulos/notificaciones/index.js";
