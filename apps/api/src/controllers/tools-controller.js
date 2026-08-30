/**
 * HTTP de cálculos de herramientas y config de survey.
 * Flags: requireWorkspaceFlag sigue en tools-service / survey-questions-service.
 */
import * as toolsService from "../services/tools-service.js";
import * as surveyQuestionsService from "../services/survey-questions-service.js";

export async function obtenerCalculoPorId(auth, req) {
  return toolsService.getToolCalculationById(auth.supabase, auth.userId, req.params.id);
}

export async function obtenerCalculo(auth, req) {
  return toolsService.getToolCalculation(
    auth.supabase,
    auth.userId,
    req.query.tool,
    req.query.prospect_id,
  );
}

export async function guardarCalculo(auth, _req, body) {
  return toolsService.upsertToolCalculation(auth.supabase, auth.userId, body);
}

export async function eliminarCalculo(auth, req) {
  return toolsService.deleteToolCalculation(
    auth.supabase,
    auth.userId,
    req.query.tool,
    req.query.prospect_id,
  );
}

export async function obtenerConfigPreguntas(auth) {
  return surveyQuestionsService.getSurveyQuestionsConfig(auth.supabase, auth.userId);
}

export async function guardarConfigPreguntas(auth, _req, body) {
  return surveyQuestionsService.saveSurveyQuestionsConfig(auth.supabase, auth.userId, body);
}
