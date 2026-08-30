/**
 * HTTP de workflow / participantes. Stubs advance/review sin cambio de contrato.
 */
import * as prospectParticipantsService from "../services/prospect-participants-service.js";
import * as workflowService from "../services/workflow-service.js";

export async function listarExpedientesActivos(auth) {
  return prospectParticipantsService.listActiveProspects(auth.supabase, auth.userId);
}

export async function obtenerParticipantes(auth, req) {
  return prospectParticipantsService.getParticipants(auth.supabase, auth.userId, req.params.id);
}

export async function listarTimeline(auth, req) {
  return prospectParticipantsService.listEventTimeline(auth.supabase, auth.userId, req.params.id);
}

export async function avanzarWorkflow() {
  return workflowService.advanceWorkflow();
}

export async function enviarARevision() {
  return workflowService.sendToManager();
}

export async function revisarWorkflow() {
  return workflowService.reviewWorkflow();
}

export async function asignarCerrador(auth, req, body) {
  return prospectParticipantsService.assignCloser(
    auth.supabase,
    auth.userId,
    req.params.id,
    body.cerrador_id ?? body.closer_id,
  );
}

export async function asignarRepresentante(auth, req, body) {
  return prospectParticipantsService.assignRepresentante(
    auth.supabase,
    auth.userId,
    req.params.id,
    body.representante_id ?? body.vendedor_id,
  );
}
