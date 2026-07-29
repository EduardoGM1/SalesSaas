/**
 * @deprecated Usar prospect-participants-service.js
 * Reexporta API de participantes sin pipeline.
 */
export {
  getParticipants as getWorkflow,
  listEventTimeline as listWorkflowTimeline,
  assignCloser,
  listActiveProspects as listWorkflowInbox,
  getParticipants,
  listEventTimeline,
  listActiveProspects,
} from "./prospect-participants-service.js";

export async function advanceWorkflow() {
  const { ServiceError } = await import("../lib/service-error.js");
  throw new ServiceError("El pipeline de etapas fue eliminado. Trabaja directamente en el expediente.", 410);
}

export async function sendToManager() {
  const { ServiceError } = await import("../lib/service-error.js");
  throw new ServiceError("El pipeline de etapas fue eliminado. No hay envío a revisión.", 410);
}

export async function reviewWorkflow() {
  const { ServiceError } = await import("../lib/service-error.js");
  throw new ServiceError("El pipeline de etapas fue eliminado. No hay revisión por etapas.", 410);
}
