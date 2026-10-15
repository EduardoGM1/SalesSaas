/**
 * HTTP de cálculos de herramientas.
 * Flags: requireWorkspaceFlag sigue en tools-service.
 * Config de preguntas Survey: modulos/survey (5b.6).
 */
import * as toolsService from "../services/tools-service.js";

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
