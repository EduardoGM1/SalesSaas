/**
 * Fachada pública — vacaciones.
 * Otros módulos / UI legacy solo importan desde aquí.
 */
export {
  calcularVacaciones,
  construirSerieAcumuladaVacaciones,
  type VacCalcInput,
  type VacCalcResult,
  type VacCumulativePoint,
} from "./dominio/calculo-vacaciones";
