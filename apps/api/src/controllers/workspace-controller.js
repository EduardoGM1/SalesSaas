/**
 * HTTP de equipo / sala activa. Rate limits de search e invite quedan en la ruta.
 */
import { parseLimitOffset } from "../lib/http.js";
import * as workspaceService from "../services/workspace-service.js";
import * as workspaceOps from "../services/workspace-ops-service.js";
import * as delegacionController from "./delegacion-controller.js";

export async function listarEquipo(auth) {
  return workspaceService.listTeamMembers(auth.supabase, auth.userId);
}

export async function listarParesSala(auth) {
  return workspaceService.listSalaPeers(auth.supabase, auth.userId);
}

export async function buscarInvitables(auth, req) {
  return workspaceService.searchInviteCandidates(auth.supabase, auth.userId, req.query.q);
}

export async function buscarCerradores(auth, req) {
  return workspaceService.searchCloserCandidates(auth.supabase, auth.userId, req.query.q);
}

export async function buscarRepresentantes(auth, req) {
  return workspaceService.searchRepresentanteCandidates(auth.supabase, auth.userId, req.query.q);
}

export async function listarExpedientesEquipo(auth, req) {
  const memberId = typeof req.query.member_id === "string" ? req.query.member_id : null;
  const { limit, offset } = parseLimitOffset(req.query);
  return workspaceService.listTeamProspects(auth.supabase, auth.userId, { memberId, limit, offset });
}

export async function invitarASala(auth, _req, body) {
  return workspaceOps.inviteAndNotify(auth.supabase, auth.userId, body);
}

export async function listarRolesAsignables(auth) {
  return workspaceService.listAssignableSalaRoles(auth.supabase, auth.userId);
}

export async function asignarRolMiembro(auth, req, body) {
  const roleId = body.role_id ?? body.roleId;
  return workspaceService.assignMemberSalaRole(auth.supabase, auth.userId, req.params.memberId, roleId);
}

export async function listarOverridesMiembro(auth, req) {
  return workspaceService.listMemberSalaOverrides(auth.supabase, auth.userId, req.params.memberId);
}

export async function fijarOverrideMiembro(auth, req, body) {
  const clave = body.clave ?? body.key;
  const otorgado = body.otorgado !== undefined ? body.otorgado === true : true;
  return workspaceService.setMemberSalaOverride(auth.supabase, auth.userId, req.params.memberId, clave, otorgado);
}

export async function quitarOverrideMiembro(auth, req) {
  return workspaceService.removeMemberSalaOverride(
    auth.supabase,
    auth.userId,
    req.params.memberId,
    decodeURIComponent(req.params.clave),
  );
}

export async function listarTechoDelegacionSala(auth) {
  const salaId = await workspaceService.resolveActiveWorkspaceId(auth.supabase, auth.userId);
  return delegacionController.listarTechoDelegacion(auth, { sala_id: salaId });
}

export async function listarDelegacionSala(auth, req) {
  const salaId = await workspaceService.resolveActiveWorkspaceId(auth.supabase, auth.userId);
  return delegacionController.listarPermisosDelegados(auth, {
    asistente_id: req.query.asistente_id,
    sala_id: salaId,
  });
}

export async function reemplazarDelegacionSala(auth, _req, body) {
  const salaId = await workspaceService.resolveActiveWorkspaceId(auth.supabase, auth.userId);
  return delegacionController.reemplazarPermisosDelegados(auth, {
    ...body,
    sala_id: salaId,
    empresa_id: null,
  });
}

export async function salirDeSala(auth) {
  return workspaceService.leaveActiveSala(auth.supabase, auth.userId);
}
