/**
 * HTTP de configuración de preguntas Survey.
 * PUT: requireWorkspaceFlag(`survey`) + requireWorkspacePermission
 * (`herramientas:survey_configurar_preguntas`, misma regla que la UI).
 * GET: solo autenticado (alcance propio); sin flag ni permiso configurar.
 * Rutas: GET|PUT /api/v1/survey/questions-config — sin renombrar.
 */
import * as surveyQuestionsService from "../servicios/survey-questions-service.js";

export async function obtenerConfigPreguntas(auth) {
  return surveyQuestionsService.getSurveyQuestionsConfig(auth.supabase, auth.userId);
}

export async function guardarConfigPreguntas(auth, _req, body) {
  return surveyQuestionsService.saveSurveyQuestionsConfig(auth.supabase, auth.userId, body);
}
