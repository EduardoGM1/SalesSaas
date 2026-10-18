/** Misma clave que el API en salas (`assertCanConfigureSurveyQuestions`). */
export const PERMISO_SURVEY_CONFIGURAR_PREGUNTAS =
  "herramientas:survey_configurar_preguntas";

/**
 * Visibilidad del botón «Configurar preguntas».
 * Personal (activo no es sala): siempre — datos del dueño; altas sin role_id.
 * Sala: solo si la clave está en el set efectivo del RPC (sin LINER_DEFAULT).
 */
export function canConfigureSurveyQuestions({ activeWorkspace, can }) {
  const isSala = activeWorkspace?.tipo === "sala_de_venta";
  if (!isSala) return true;
  return typeof can === "function"
    ? can(PERMISO_SURVEY_CONFIGURAR_PREGUNTAS)
    : false;
}
