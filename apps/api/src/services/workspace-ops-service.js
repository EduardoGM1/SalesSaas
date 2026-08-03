import { ServiceError } from "../lib/service-error.js";
import * as workspaceService from "./workspace-service.js";
import { sendSalaInviteEmail } from "./support-email.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";

export async function inviteAndNotify(supabase, userId, body) {
  const result = await workspaceService.inviteToActiveSala(supabase, userId, body);
  if (result.already_member) return result;

  const { data: inviter } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();

  await sendSalaInviteEmail({
    toEmail: result.member.email,
    inviteeName: result.member.full_name || result.member.email,
    salaNombre: result.workspace?.nombre,
    inviterName: inviter?.full_name || inviter?.email || "Un gerente",
  });
  return result;
}

/** Contactos de Red que pertenecen al mismo workspace del expediente. */
export async function listShareableContactsForProspect(supabase, userId, prospectId) {
  const { data: prospect, error } = await supabase
    .from("prospects")
    .select("id, workspace_id, user_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!prospect) throw new ServiceError("Expediente no encontrado.", 404);

  const inWs = await workspaceService.userInWorkspace(supabase, userId, prospect.workspace_id);
  if (!inWs && prospect.user_id !== userId) {
    throw new ServiceError("Sin acceso al expediente.", 403);
  }

  const { data: rows, error: cErr } = await supabase
    .from("user_connections")
    .select("id, requester_id, addressee_id, status")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (cErr) throw new ServiceError(cErr.message, 500);

  const peerIds = (rows || []).map((r) => (r.requester_id === userId ? r.addressee_id : r.requester_id));
  if (!peerIds.length) return [];

  const admin = createServiceSupabaseClient();
  const client = admin || supabase;
  const { data: memberships, error: mErr } = await client
    .from("workspace_miembros")
    .select("usuario_id")
    .eq("workspace_id", prospect.workspace_id)
    .in("usuario_id", peerIds);
  if (mErr) throw new ServiceError(mErr.message, 500);
  const allowed = new Set((memberships || []).map((m) => m.usuario_id));

  const { data: profiles } = await client
    .from("profiles")
    .select("id, email, full_name, avatar_url, last_seen_at")
    .in("id", peerIds);

  const byId = new Map((profiles || []).map((p) => [p.id, p]));
  return peerIds.map((id) => {
    const p = byId.get(id);
    const ok = allowed.has(id);
    return {
      id,
      full_name: p?.full_name ?? null,
      email: p?.email ?? null,
      avatar_url: p?.avatar_url ?? null,
      last_seen_at: p?.last_seen_at ?? null,
      same_workspace: ok,
      selectable: ok,
    };
  });
}

/**
 * Destinos válidos para duplicar/transferir. La transferencia Personal → Sala
 * es la única vía permitida hacia una empresa (definitiva, dueño y miembro);
 * el regreso Empresa → Personal y el salto entre empresas siguen prohibidos.
 */
export async function listTransferTargets(supabase, userId, prospectId, mode = "transfer") {
  const { data: prospect, error } = await supabase
    .from("prospects")
    .select("id, workspace_id, user_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!prospect) throw new ServiceError("Expediente no encontrado.", 404);
  if (prospect.user_id !== userId) {
    const inWs = await workspaceService.userInWorkspace(supabase, userId, prospect.workspace_id);
    if (!inWs) throw new ServiceError("Sin acceso al expediente.", 403);
  }

  const workspaces = await workspaceService.listUserWorkspaces(supabase, userId);
  const current = workspaces.find((w) => w.id === prospect.workspace_id) || null;
  const isOwner = prospect.user_id === userId;

  const out = [];
  for (const w of workspaces) {
    let allowed = false;
    let reason = null;
    if (w.id === prospect.workspace_id) {
      allowed = true;
    } else if (current?.tipo === "personal" && w.tipo === "sala_de_venta") {
      if (mode !== "transfer") {
        allowed = false;
        reason = workspaceService.CROSS_BOUNDARY_MSG;
      } else {
        allowed = isOwner;
        if (!isOwner) reason = "Solo el dueño puede transferir a una sala.";
      }
    } else if (current?.tipo === "sala_de_venta" && w.tipo === "personal") {
      allowed = false;
      reason = workspaceService.CROSS_BOUNDARY_MSG;
    } else {
      try {
        await workspaceService.assertWorkspaceBoundary(supabase, prospect.workspace_id, w.id);
        allowed = true;
      } catch (err) {
        allowed = false;
        reason = err instanceof ServiceError ? err.message : workspaceService.CROSS_BOUNDARY_MSG;
      }
    }
    out.push({
      id: w.id,
      tipo: w.tipo,
      nombre: w.nombre,
      empresa_id: w.empresa_id ?? null,
      empresa_nombre: w.empresa_nombre,
      allowed,
      reason,
      is_current: w.id === prospect.workspace_id,
    });
  }
  return out;
}
