import { isUuid } from "@salesapp/shared/data/mappers.js";
import { PROSPECT_LIST_COLUMNS } from "@salesapp/shared/data/sync-columns.js";
import { bodyToProspectInsert, bodyToProspectPatch } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import {
  getRequestWorkspaceContext,
  requireWorkspacePermission,
  scopeByWorkspace,
} from "../lib/workspace-scope.js";
import { canEditProspectRecord } from "../lib/prospect-edit-access.js";

export async function listProspects(supabase, userId, { limit, offset, status }) {
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  const { data: assignments } = !ctx.teamScope
    ? await supabase
      .from("prospect_workflows")
      .select("prospect_id")
      .eq("workspace_id", ctx.workspaceId)
      .eq("cerrador_id", userId)
      .neq("estado", "cancelado")
    : { data: [] };
  const assignedIds = (assignments ?? []).map((row) => row.prospect_id);
  if (!assignedIds.length) {
    await requireWorkspacePermission(supabase, userId, "expedientes:ver_propios", ctx.workspaceId);
  }
  let q = supabase
    .from("prospects")
    .select(PROSPECT_LIST_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  q = scopeByWorkspace(q, ctx.workspaceId);
  if (!ctx.teamScope) {
    q = assignedIds.length
      ? q.or(`user_id.eq.${userId},id.in.(${assignedIds.join(",")})`)
      : q.eq("user_id", userId);
  }
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createProspect(supabase, userId, body) {
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:crear");
  const row = bodyToProspectInsert(body, userId, workspaceId);
  const { data, error } = await supabase.from("prospects").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);

  // En sala: registrar participantes y chat (Gerente + Vendedor) de inmediato.
  const { data: ws } = await supabase
    .from("workspaces")
    .select("tipo")
    .eq("id", workspaceId)
    .maybeSingle();
  if (ws?.tipo === "sala_de_venta") {
    const { createServiceSupabaseClient } = await import("../lib/supabase-server.js");
    const admin = createServiceSupabaseClient();
    if (admin) {
      const { data: gerente } = await admin
        .from("workspace_miembros")
        .select("usuario_id")
        .eq("workspace_id", workspaceId)
        .eq("rol_en_workspace", "gerente")
        .limit(1)
        .maybeSingle();
      await admin.from("prospect_workflows").upsert({
        prospect_id: data.id,
        workspace_id: workspaceId,
        representante_id: userId,
        gerente_id: gerente?.usuario_id || null,
        created_by: userId,
        etapa_actual: "abierto",
        estado: "en_progreso",
      }, { onConflict: "prospect_id" });
      await admin.rpc("sync_prospect_chat_members", { p_prospect_id: data.id }).catch(() => {});
    }
  }
  return data;
}

export async function getProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  const { data: assignment } = await supabase
    .from("prospect_workflows")
    .select("prospect_id")
    .eq("prospect_id", id)
    .eq("cerrador_id", userId)
    .maybeSingle();
  if (!assignment) {
    await requireWorkspacePermission(supabase, userId, "expedientes:ver_propios", ctx.workspaceId);
  }
  let q = supabase.from("prospects").select("*").eq("id", id);
  q = scopeByWorkspace(q, ctx.workspaceId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Expediente no encontrado.");
}

export async function updateProspect(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = bodyToProspectPatch(body);
  if (!Object.keys(patch).length) throw new ServiceError("Sin campos para actualizar.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  let q = supabase.from("prospects").select("id, user_id, workspace_id").eq("id", id);
  q = scopeByWorkspace(q, ctx.workspaceId);
  const { data: prospect, error: loadErr } = await q.maybeSingle();
  if (loadErr) throw new ServiceError(loadErr.message, 500);
  if (!prospect) throw new ServiceError("Expediente no encontrado.", 404);

  const { data: permissionKeys } = await supabase.rpc("effective_workspace_permissions", {
    p_usuario_id: userId,
    p_workspace_id: ctx.workspaceId,
  });
  const permissions = new Set(Array.isArray(permissionKeys) ? permissionKeys : []);

  const { data: workflow } = await supabase
    .from("prospect_workflows")
    .select("representante_id, cerrador_id")
    .eq("prospect_id", id)
    .maybeSingle();

  if (!canEditProspectRecord({ actorId: userId, prospect, workflow, permissions })) {
    throw new ServiceError("No tienes permiso para editar este expediente.", 403);
  }

  let updateQ = supabase.from("prospects").update(patch).eq("id", id);
  updateQ = scopeByWorkspace(updateQ, ctx.workspaceId);
  const { data, error } = await updateQ.select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Expediente no encontrado.");
}

export async function deleteProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const workspaceId = await requireWorkspacePermission(supabase, userId, "expedientes:eliminar");

  // Un expediente transferido a una sala conserva su auditoría: en salas
  // solo puede eliminar quien tiene alcance de equipo (gerente).
  const { data: ws } = await supabase
    .from("workspaces")
    .select("tipo")
    .eq("id", workspaceId)
    .maybeSingle();
  if (ws?.tipo === "sala_de_venta") {
    const { data: membership } = await supabase
      .from("workspace_miembros")
      .select("rol_en_workspace")
      .eq("workspace_id", workspaceId)
      .eq("usuario_id", userId)
      .maybeSingle();
    if (membership?.rol_en_workspace !== "gerente") {
      throw new ServiceError("Los expedientes de la sala no se pueden eliminar. Contacta a tu gerente.", 403);
    }
  }

  let q = supabase.from("prospects").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  q = scopeByWorkspace(q, workspaceId);
  const { error, count } = await q;
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Expediente no encontrado.", 404);
  return { ok: true };
}
