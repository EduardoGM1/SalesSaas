/**
 * HTTP de shares / invitaciones / transferencias de expedientes.
 */
import * as sharingService from "../services/sharing-service.js";
import * as workspaceOps from "../services/workspace-ops-service.js";

export async function listarRecibidos(auth) {
  return sharingService.listSharedWithMe(auth.supabase, auth.userId);
}

export async function listarSharesExpediente(auth, req) {
  return sharingService.listSharesForProspect(auth.supabase, auth.userId, req.params.id);
}

export async function crearShare(auth, req, body) {
  return sharingService.createShare(auth.supabase, auth.userId, req.params.id, body);
}

export async function crearInvitacionShare(auth, req, body) {
  return sharingService.createShareInvite(auth.supabase, auth.userId, req.params.id, body);
}

export async function redimirInvitacion(auth, req) {
  return sharingService.redeemShareInvite(auth.supabase, auth.userId, req.params.token);
}

export async function listarFijadosWorkspace(auth) {
  return sharingService.listWorkspacePinned(auth.supabase, auth.userId);
}

export async function agregarShareAWorkspace(auth, req) {
  return sharingService.addShareToWorkspace(auth.supabase, auth.userId, req.params.id);
}

export async function listarDestinosTransferencia(auth, req) {
  return workspaceOps.listTransferTargets(
    auth.supabase,
    auth.userId,
    req.params.id,
    req.query.mode === "duplicate" ? "duplicate" : "transfer",
  );
}

export async function listarContactosCompartibles(auth, req) {
  return workspaceOps.listShareableContactsForProspect(auth.supabase, auth.userId, req.params.id);
}

export async function duplicarExpediente(auth, req) {
  let body = {};
  try {
    if (req.body && typeof req.body === "object") body = req.body;
  } catch {
    body = {};
  }
  return sharingService.duplicateProspect(auth.supabase, auth.userId, req.params.id, body);
}

export async function transferirExpediente(auth, req, body) {
  return sharingService.transferProspectOwnership(auth.supabase, auth.userId, req.params.id, body);
}

export async function pedirUpgradePermiso(auth, req, body) {
  return sharingService.requestPermissionUpgrade(auth.supabase, auth.userId, req.params.id, body);
}

export async function decidirUpgradePermiso(auth, req, body) {
  return sharingService.decidePermissionRequest(auth.supabase, auth.userId, req.params.id, body);
}

export async function actualizarPermisoShare(auth, req, body) {
  return sharingService.updateSharePermission(auth.supabase, auth.userId, req.params.id, body.permission);
}

export async function eliminarShare(auth, req) {
  return sharingService.deleteShare(auth.supabase, auth.userId, req.params.id);
}

export async function obtenerExpedienteCompartido(auth, req) {
  return sharingService.getSharedProspect(auth.supabase, auth.userId, req.params.id);
}

export async function obtenerHerramientaCompartida(auth, req) {
  return sharingService.getSharedTool(auth.supabase, auth.userId, req.params.id, req.params.tool);
}

export async function guardarHerramientaCompartida(auth, req, body) {
  return sharingService.saveSharedTool(auth.supabase, auth.userId, req.params.id, req.params.tool, body?.data ?? body);
}

export async function actualizarExpedienteCompartido(auth, req, body) {
  return sharingService.updateSharedProspect(auth.supabase, auth.userId, req.params.id, body);
}
