/**
 * Fachada pública — agenda (web).
 * Tramo A: UI + hooks + acciones. Sync/outbox/API fuera.
 */
export {
  contarDiasDescanso,
  esDiaDescanso,
  countDescansoDays,
  isDescansoDay,
  resolverIdClienteEntrada,
  resolveEntryClientId,
} from "./fachada-node.js";

export {
  guardarNotaCliente,
  guardarNotaUsuario,
  guardarDescanso,
  guardarSinTour,
  saveClientNote,
  saveAgendaUserNote,
  saveAgendaDayOff,
  saveAgendaNoTour,
} from "./servicios/acciones-agenda.js";

export { useCalendarActions, useAccionesAgenda } from "./hooks/use-calendar-actions.js";
export { CalendarPage } from "./ui/calendar-page.jsx";
export { EntryDialog } from "./ui/entry-dialog.jsx";
