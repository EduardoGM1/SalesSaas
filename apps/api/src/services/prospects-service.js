import { isUuid } from "@salesapp/shared/data/mappers.js";
import { generateClientId, generateProspectCode, generateSaleId } from "@salesapp/shared/ids.js";
import { bodyToProspectInsert, bodyToProspectPatch } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { writeResourceAudit, RESOURCE_AUDIT_ACTIONS } from "./resource-audit-service.js";
import { getPersonalWorkspaceId, ensurePersonalWorkspace } from "./workspace-service.js";

export async function listProspects(supabase, userId, { limit, offset, status }) {
  let q = supabase
    .from("prospects")
    .select("*", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (status) q = q.eq("status", status);
  const { data, error, count } = await q;
  if (error) throw new ServiceError(error.message, 500);
  return { data: data ?? [], total: count ?? 0, limit, offset };
}

export async function createProspect(supabase, userId, body) {
  const row = bodyToProspectInsert(body, userId);
  try {
    await ensurePersonalWorkspace(supabase, userId);
    const wsId = await getPersonalWorkspaceId(supabase, userId);
    if (wsId) row.workspace_propietario_id = wsId;
  } catch {
    // 0054 no aplicada
  }
  const { data, error } = await supabase.from("prospects").insert(row).select().single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

export async function getProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { data, error } = await supabase.from("prospects").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return assertFound(data, "Expediente no encontrado.");
}

export async function updateProspect(supabase, userId, id, body) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const patch = bodyToProspectPatch(body);
  if (!Object.keys(patch).length) throw new ServiceError("Sin campos para actualizar.");
  const { data, error } = await supabase.from("prospects").update(patch).eq("id", id).eq("user_id", userId).select().maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Expediente no encontrado.");
}

export async function deleteProspect(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const { error, count } = await supabase.from("prospects").delete({ count: "exact" }).eq("id", id).eq("user_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Expediente no encontrado.", 404);
  return { ok: true };
}

/**
 * Duplica el expediente (nuevo id). Copia tools y sales opcionales; sin sync al original.
 */
export async function duplicateProspect(supabase, userId, id, { include_tools: includeTools = true, include_sales: includeSales = false } = {}) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");

  const { data: source, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(source, "Expediente no encontrado.");

  await ensurePersonalWorkspace(supabase, userId).catch(() => null);
  const wsId = await getPersonalWorkspaceId(supabase, userId);

  const newId = generateClientId();
  const {
    id: _id,
    created_at: _c,
    updated_at: _u,
    anonymized_at: _a,
    workspace_propietario_id: _w,
    ...rest
  } = source;

  const insertRow = {
    ...rest,
    id: newId,
    user_id: userId,
    prospect_code: generateProspectCode(newId),
    workspace_propietario_id: wsId || null,
  };

  const { data: created, error: insErr } = await supabase
    .from("prospects")
    .insert(insertRow)
    .select()
    .single();
  if (insErr) throw new ServiceError(insErr.message, 400);

  if (includeTools) {
    const { data: tools } = await supabase
      .from("tool_calculations")
      .select("tool, data")
      .eq("prospect_id", id);
    if (tools?.length) {
      const rows = tools.map((t) => ({
        user_id: userId,
        prospect_id: newId,
        tool: t.tool,
        data: t.data ?? {},
      }));
      const { error: tErr } = await supabase.from("tool_calculations").insert(rows);
      if (tErr) console.warn("[duplicate] tools:", tErr.message);
    }
  }

  if (includeSales) {
    const { data: sales } = await supabase.from("sales").select("*").eq("prospect_id", id);
    if (sales?.length) {
      const rows = sales.map((s) => {
        const { id: _sid, created_at: _sc, ...saleRest } = s;
        return {
          ...saleRest,
          id: generateSaleId(),
          user_id: userId,
          prospect_id: newId,
        };
      });
      const { error: sErr } = await supabase.from("sales").insert(rows);
      if (sErr) console.warn("[duplicate] sales:", sErr.message);
    }
  }

  await writeResourceAudit(supabase, {
    actorId: userId,
    accion: RESOURCE_AUDIT_ACTIONS.DUPLICAR,
    entidadId: newId,
    detalle: {
      source_prospect_id: id,
      include_tools: includeTools === true,
      include_sales: includeSales === true,
    },
  });

  return created;
}

/**
 * Transfiere propiedad del expediente a otro usuario (su workspace personal).
 * Solo el owner actual puede transferir.
 */
export async function transferProspect(supabase, userId, id, { to_user_id: toUserId }) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  if (!isUuid(toUserId)) throw new ServiceError("Usuario destino inválido.");
  if (toUserId === userId) throw new ServiceError("El destino debe ser otro usuario.");

  const { data: source, error } = await supabase
    .from("prospects")
    .select("id, user_id, workspace_propietario_id, prospect_code")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(source, "Expediente no encontrado.");

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", toUserId)
    .maybeSingle();
  if (!targetProfile) throw new ServiceError("Usuario destino no encontrado.", 404);

  let targetWs = null;
  try {
    const admin = createServiceSupabaseClient();
    const { data: ensured, error: ensErr } = await admin.rpc("ensure_personal_workspace", { p_uid: toUserId });
    if (ensErr) throw ensErr;
    targetWs = ensured;
  } catch {
    targetWs = await getPersonalWorkspaceId(supabase, toUserId);
  }
  if (!targetWs) throw new ServiceError("El destino no tiene workspace personal (aplica migración 0054).", 503);

  let nextCode = source.prospect_code;
  const { data: clash } = await supabase
    .from("prospects")
    .select("id")
    .eq("user_id", toUserId)
    .eq("prospect_code", nextCode)
    .maybeSingle();
  if (clash) nextCode = generateProspectCode(id);

  const { data: updated, error: upErr } = await supabase
    .from("prospects")
    .update({
      user_id: toUserId,
      workspace_propietario_id: targetWs,
      prospect_code: nextCode,
    })
    .eq("id", id)
    .eq("user_id", userId)
    .select()
    .maybeSingle();
  if (upErr) throw new ServiceError(upErr.message, 400);
  assertFound(updated, "Expediente no encontrado.");

  // Post-transfer: el actor ya no es owner → service_role para alinear hijos y share residual.
  try {
    const admin = createServiceSupabaseClient();
    await admin.from("sales").update({ user_id: toUserId }).eq("prospect_id", id);
    await admin.from("tool_calculations").update({ user_id: toUserId }).eq("prospect_id", id);
    await admin.from("prospect_shares").upsert({
      prospect_id: id,
      owner_id: toUserId,
      shared_with_id: userId,
      permission: "edit",
    }, { onConflict: "prospect_id,shared_with_id" });
  } catch (err) {
    console.warn("[transfer] post-ops:", err instanceof Error ? err.message : err);
  }

  await writeResourceAudit(supabase, {
    actorId: userId,
    accion: RESOURCE_AUDIT_ACTIONS.TRANSFERIR_PROPIEDAD,
    entidadId: id,
    detalle: {
      from_user_id: userId,
      to_user_id: toUserId,
      from_workspace_id: source.workspace_propietario_id,
      to_workspace_id: targetWs,
    },
  });

  return updated;
}
