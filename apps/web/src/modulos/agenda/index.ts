/**
 * Fachada pública — agenda (web).
 * Tramo B: solo dominio puro (descansos). UI/API/sync en tramos posteriores.
 * Otros módulos (p. ej. metas) importan solo desde aquí.
 */
export {
  contarDiasDescanso,
  esDiaDescanso,
  countDescansoDays,
  isDescansoDay,
} from "./dominio/calendar-descansos.js";
