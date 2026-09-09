import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToToolUpsert } from "@salesapp/shared/api/validators.js";
import { ServiceError } from "../lib/service-error.js";
import { logger } from "../lib/logger.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { profileDisplayName } from "../lib/profile-display-name.js";
import {
  getRequestWorkspaceContext,
  requireWorkspaceFlag,
  scopeByWorkspace,
} from "../lib/workspace-scope.js";
import { TOOL_FLAG_KEYS } from "./flags-service.js";
import { notifyProspectSectionChanged } from "./push-notifications-service.js";

const SECTION_TOOLS = new Set(["survey", "vacaciones", "worksheet"]);

async function calculationOwnerId(supabase, actorId, prospectId) {
  if (!isUuid(prospectId)) return actorId;
  const { data } = await supabase
    .from("prospects")
    .select("user_id")
    .eq("id", prospectId)
    .maybeSingle();
  return data?.user_id || actorId;
}

/**
 * Los cálculos se guardan bajo el user_id del dueño del expediente. Si el actor
 * no es el dueño, solo puede escribir si tiene share `edit` o es participante
 * (representante/cerrador) del pipeline; poder leer el prospecto no basta.
 */
async function assertCanWriteAsOwner(supabase, actorId, ownerId, prospectId) {
  if (ownerId === actorId || !isUuid(prospectId)) return;
  const client = createServiceSupabaseClient() || supabase;
  const [{ data: share }, { data: wf }] = await Promise.all([
    client
      .from("prospect_shares")
      .select("permission")
      .eq("prospect_id", prospectId)
      .eq("shared_with_id", actorId)
      .maybeSingle(),
    client
      .from("prospect_workflows")
      .select("representante_id, cerrador_id")
      .eq("prospect_id", prospectId)
      .maybeSingle(),
  ]);
  const canEdit = share?.permission === "edit"
    || wf?.representante_id === actorId
    || wf?.cerrador_id === actorId;
  if (!canEdit) throw new ServiceError("No tienes permiso para editar este expediente.", 403);
}

export async function getToolCalculation(supabase, userId, tool, prospectId) {
  if (!tool) throw new ServiceError("tool requerido.");
  const workspaceId = await requireWorkspaceFlag(supabase, userId, TOOL_FLAG_KEYS[tool] || tool);
  const ownerId = await calculationOwnerId(supabase, userId, prospectId);
  let q = supabase.from("tool_calculations").select("*").eq("user_id", ownerId).eq("tool", tool);
  q = scopeByWorkspace(q, workspaceId);
  if (prospectId === "libre" || prospectId === null || prospectId === undefined) {
    q = q.is("prospect_id", null);
  } else if (isUuid(prospectId)) {
    q = q.eq("prospect_id", prospectId);
  } else {
    throw new ServiceError("prospect_id inválido.");
  }
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data ?? null;
}

export async function getToolCalculationById(supabase, userId, id) {
  if (!isUuid(id)) throw new ServiceError("ID inválido.");
  const ctx = await getRequestWorkspaceContext(supabase, userId);
  let metaQ = supabase.from("tool_calculations").select("id, tool, workspace_id").eq("id", id);
  metaQ = scopeByWorkspace(metaQ, ctx.workspaceId);
  const { data: meta, error: metaErr } = await metaQ.maybeSingle();
  if (metaErr) throw new ServiceError(metaErr.message, 500);
  if (!meta) throw new ServiceError("Cálculo no encontrado.", 404);
  await requireWorkspaceFlag(supabase, userId, TOOL_FLAG_KEYS[meta.tool] || meta.tool);

  let q = supabase.from("tool_calculations").select("*").eq("id", id);
  q = scopeByWorkspace(q, ctx.workspaceId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!data) throw new ServiceError("Cálculo no encontrado.", 404);
  return data;
}

export async function upsertToolCalculation(supabase, userId, body) {
  const workspaceId = await requireWorkspaceFlag(
    supabase,
    userId,
    TOOL_FLAG_KEYS[body?.tool] || body?.tool,
  );
  const ownerId = await calculationOwnerId(supabase, userId, body?.prospect_id);
  await assertCanWriteAsOwner(supabase, userId, ownerId, body?.prospect_id);
  const row = bodyToToolUpsert(body, ownerId, workspaceId);
  if (!row) throw new ServiceError("tool y data son requeridos.");
  const { data, error } = await supabase.from("tool_calculations").upsert(row, { onConflict: "user_id,prospect_id,tool" }).select().single();
  if (error) throw new ServiceError(error.message, 400);

  if (data?.prospect_id && SECTION_TOOLS.has(data.tool)) {
    notifyOwnerToolCollaborators(supabase, {
      actorId: userId,
      prospectId: data.prospect_id,
      section: data.tool,
    }).catch((err) => logger.warn("[tools] push section", { error: err }));
  }

  return data;
}

async function notifyOwnerToolCollaborators(supabase, { actorId, prospectId, section }) {
  const admin = createServiceSupabaseClient() || supabase;
  const [{ data: shares }, { data: participants }, { data: prospect }] = await Promise.all([
    admin.from("prospect_shares").select("shared_with_id, owner_id").eq("prospect_id", prospectId),
    admin
      .from("prospect_workflows")
      .select("representante_id, cerrador_id")
      .eq("prospect_id", prospectId)
      .maybeSingle(),
    admin.from("prospects").select("user_id").eq("id", prospectId).maybeSingle(),
  ]);

  const ownerId = prospect?.user_id
    || shares?.[0]?.owner_id
    || participants?.representante_id
    || actorId;

  // Participantes del expediente (vendedor ↔ cerrador). Sin gerente por defecto.
  const recipientIds = [
    ownerId,
    participants?.representante_id,
    participants?.cerrador_id,
    ...(shares || []).map((r) => r.shared_with_id),
  ].filter(Boolean);

  if (!recipientIds.some((id) => id !== actorId)) return;

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name, email, settings")
    .eq("id", actorId)
    .maybeSingle();
  const actorName = profileDisplayName(profile, "Alguien");

  await notifyProspectSectionChanged({
    actorId,
    actorName,
    prospectId,
    ownerId,
    section,
    recipientIds,
  });
}

export async function deleteToolCalculation(supabase, userId, tool, prospectId) {
  if (!tool) throw new ServiceError("tool requerido.");
  const workspaceId = await requireWorkspaceFlag(supabase, userId, TOOL_FLAG_KEYS[tool] || tool);
  const ownerId = await calculationOwnerId(supabase, userId, prospectId);
  await assertCanWriteAsOwner(supabase, userId, ownerId, prospectId);
  let q = supabase.from("tool_calculations").delete().eq("user_id", ownerId).eq("tool", tool);
  q = scopeByWorkspace(q, workspaceId);
  if (prospectId === "libre") q = q.is("prospect_id", null);
  else if (isUuid(prospectId)) q = q.eq("prospect_id", prospectId);
  else throw new ServiceError("prospect_id inválido.");
  const { error } = await q;
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}
