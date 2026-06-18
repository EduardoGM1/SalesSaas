import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToProspectPatch } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { notifyProspectShared } from "./push-notifications-service.js";

function profileName(profile) {
  return profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Usuario";
}

async function loadProfiles(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", unique);
  if (error) throw new ServiceError(error.message, 500);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

function prospectDisplayName(prospect) {
  if (!prospect) return "Expediente";
  const name = [prospect.name1, prospect.name2].filter(Boolean).join(" / ");
  return name || prospect.name || prospect.prospect_code || "Expediente";
}

const VALID_PERMISSIONS = ["view", "edit", "comment"];

function mapShare(row, profiles, prospects) {
  const prospect = prospects.get(row.prospect_id);
  return {
    id: row.id,
    prospect_id: row.prospect_id,
    owner_id: row.owner_id,
    shared_with_id: row.shared_with_id,
    permission: row.permission,
    created_at: row.created_at,
    prospect_name: prospectDisplayName(prospect),
    prospect_code: prospect?.prospect_code,
    shared_with: profiles.get(row.shared_with_id) ?? null,
    owner: profiles.get(row.owner_id) ?? null,
  };
}

export async function listSharesForProspect(supabase, userId, prospectId) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");
  const { data: owned } = await supabase
    .from("prospects")
    .select("id")
    .eq("id", prospectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) throw new ServiceError("Expediente no encontrado.", 404);

  const { data, error } = await supabase
    .from("prospect_shares")
    .select("id, prospect_id, owner_id, shared_with_id, permission, created_at")
    .eq("prospect_id", prospectId)
    .eq("owner_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new ServiceError(error.message, 500);

  const rows = data ?? [];
  const profiles = await loadProfiles(supabase, rows.flatMap((r) => [r.owner_id, r.shared_with_id]));
  const { data: prospectRows } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", prospectId)
    .maybeSingle();
  const prospects = new Map(prospectRows ? [[prospectRows.id, prospectRows]] : []);
  return rows.map((row) => mapShare(row, profiles, prospects));
}

export async function listSharesWithContact(supabase, userId, contactId) {
  if (!isUuid(contactId)) throw new ServiceError("Contacto inválido.");

  const { data, error } = await supabase
    .from("prospect_shares")
    .select("id, prospect_id, owner_id, shared_with_id, permission, created_at")
    .or(`and(owner_id.eq.${userId},shared_with_id.eq.${contactId}),and(owner_id.eq.${contactId},shared_with_id.eq.${userId})`)
    .order("created_at", { ascending: false });
  if (error) throw new ServiceError(error.message, 500);

  const rows = data ?? [];
  const profiles = await loadProfiles(supabase, rows.flatMap((r) => [r.owner_id, r.shared_with_id]));
  const prospectIds = [...new Set(rows.map((r) => r.prospect_id))];
  const { data: prospectRows } = prospectIds.length
    ? await supabase.from("prospects").select("id, prospect_code, name, name1, name2").in("id", prospectIds)
    : { data: [] };
  const prospects = new Map((prospectRows ?? []).map((p) => [p.id, p]));

  const mapped = rows.map((row) => mapShare(row, profiles, prospects));
  return {
    received: mapped.filter((s) => s.owner_id === contactId && s.shared_with_id === userId),
    sent: mapped.filter((s) => s.owner_id === userId && s.shared_with_id === contactId),
  };
}

export async function listSharedWithMe(supabase, userId) {
  const { data, error } = await supabase
    .from("prospect_shares")
    .select("id, prospect_id, owner_id, shared_with_id, permission, created_at")
    .eq("shared_with_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new ServiceError(error.message, 500);

  const rows = data ?? [];
  const profiles = await loadProfiles(supabase, rows.flatMap((r) => [r.owner_id, r.shared_with_id]));
  const prospectIds = [...new Set(rows.map((r) => r.prospect_id))];
  const { data: prospectRows } = prospectIds.length
    ? await supabase.from("prospects").select("id, prospect_code, name, name1, name2").in("id", prospectIds)
    : { data: [] };
  const prospects = new Map((prospectRows ?? []).map((p) => [p.id, p]));
  return rows.map((row) => mapShare(row, profiles, prospects));
}

export async function createShare(supabase, userId, prospectId, { shared_with_id: sharedWithId, permission = "view" }) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");
  if (!isUuid(sharedWithId)) throw new ServiceError("Usuario inválido.");
  if (!VALID_PERMISSIONS.includes(permission)) throw new ServiceError("Permiso inválido.");
  if (sharedWithId === userId) throw new ServiceError("No puedes compartir contigo mismo.");

  const { data: owned } = await supabase
    .from("prospects")
    .select("id")
    .eq("id", prospectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) throw new ServiceError("Expediente no encontrado.", 404);

  const { data: priorShare } = await supabase
    .from("prospect_shares")
    .select("id")
    .eq("prospect_id", prospectId)
    .eq("shared_with_id", sharedWithId)
    .maybeSingle();

  const { data, error } = await supabase
    .from("prospect_shares")
    .upsert({
      prospect_id: prospectId,
      owner_id: userId,
      shared_with_id: sharedWithId,
      permission,
    }, { onConflict: "prospect_id,shared_with_id" })
    .select("id, prospect_id, owner_id, shared_with_id, permission, created_at")
    .single();
  if (error) {
    if (error.message?.includes("row-level security")) {
      throw new ServiceError("Solo puedes compartir con contactos aceptados.", 403);
    }
    throw new ServiceError(error.message, 400);
  }
  const profiles = await loadProfiles(supabase, [userId, sharedWithId]);
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", prospectId)
    .maybeSingle();
  const prospects = new Map(prospect ? [[prospect.id, prospect]] : []);
  const mapped = mapShare(data, profiles, prospects);
  if (!priorShare) {
    const owner = profiles.get(userId);
    notifyProspectShared(sharedWithId, {
      ownerId: userId,
      ownerName: profileName(owner),
      prospectId,
      prospectName: mapped.prospect_name,
    }).catch(() => {});
  }
  return mapped;
}

export async function updateSharePermission(supabase, userId, shareId, permission) {
  if (!isUuid(shareId)) throw new ServiceError("Compartido inválido.");
  if (!VALID_PERMISSIONS.includes(permission)) throw new ServiceError("Permiso inválido.");

  const { data, error } = await supabase
    .from("prospect_shares")
    .update({ permission })
    .eq("id", shareId)
    .eq("owner_id", userId)
    .select("id, prospect_id, owner_id, shared_with_id, permission, created_at")
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  assertFound(data, "Compartido no encontrado.");
  const profiles = await loadProfiles(supabase, [data.owner_id, data.shared_with_id]);
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", data.prospect_id)
    .maybeSingle();
  const prospects = new Map(prospect ? [[prospect.id, prospect]] : []);
  return mapShare(data, profiles, prospects);
}

export async function deleteShare(supabase, userId, shareId) {
  if (!isUuid(shareId)) throw new ServiceError("Compartido inválido.");
  const { error, count } = await supabase
    .from("prospect_shares")
    .delete({ count: "exact" })
    .eq("id", shareId)
    .eq("owner_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Compartido no encontrado.", 404);
  return { ok: true };
}

export async function getSharedProspect(supabase, userId, prospectId) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");

  const { data: owned } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (owned) {
    const tools = await loadProspectTools(supabase, prospectId);
    return { prospect: owned, permission: "owner", tools };
  }

  const { data: share } = await supabase
    .from("prospect_shares")
    .select("permission")
    .eq("prospect_id", prospectId)
    .eq("shared_with_id", userId)
    .maybeSingle();
  if (!share) throw new ServiceError("Expediente no encontrado.", 404);

  const { data: prospect, error } = await supabase
    .from("prospects")
    .select("*")
    .eq("id", prospectId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(prospect, "Expediente no encontrado.");
  const tools = await loadProspectTools(supabase, prospectId);
  return { prospect, permission: share.permission, tools };
}

async function loadProspectTools(supabase, prospectId) {
  const { data: toolRows, error } = await supabase
    .from("tool_calculations")
    .select("tool, data")
    .eq("prospect_id", prospectId);
  if (error) throw new ServiceError(error.message, 500);
  const tools = {};
  for (const row of toolRows ?? []) {
    tools[row.tool] = row.data ?? {};
  }
  return tools;
}

async function resolveSharedAccess(supabase, userId, prospectId) {
  const { data: owned } = await supabase
    .from("prospects")
    .select("user_id")
    .eq("id", prospectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (owned) return { permission: "owner", ownerId: userId };

  const { data: share } = await supabase
    .from("prospect_shares")
    .select("permission, owner_id")
    .eq("prospect_id", prospectId)
    .eq("shared_with_id", userId)
    .maybeSingle();
  if (!share) throw new ServiceError("Expediente no encontrado.", 404);
  return { permission: share.permission, ownerId: share.owner_id };
}

const SHARED_TOOLS = new Set(["survey", "vacaciones", "worksheet"]);

export async function getSharedTool(supabase, userId, prospectId, tool) {
  if (!SHARED_TOOLS.has(tool)) throw new ServiceError("Herramienta inválida.");
  await resolveSharedAccess(supabase, userId, prospectId);
  const { data, error } = await supabase
    .from("tool_calculations")
    .select("data")
    .eq("prospect_id", prospectId)
    .eq("tool", tool)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data?.data ?? {};
}

export async function saveSharedTool(supabase, userId, prospectId, tool, data) {
  if (!SHARED_TOOLS.has(tool)) throw new ServiceError("Herramienta inválida.");
  const access = await resolveSharedAccess(supabase, userId, prospectId);
  if (access.permission !== "owner" && access.permission !== "edit") {
    throw new ServiceError("Solo lectura: no puedes editar esta herramienta.", 403);
  }
  const { data: saved, error } = await supabase
    .from("tool_calculations")
    .upsert({
      user_id: access.ownerId,
      prospect_id: prospectId,
      tool,
      data: data || {},
    }, { onConflict: "user_id,prospect_id,tool" })
    .select("data")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return saved?.data ?? {};
}

export async function updateSharedProspect(supabase, userId, prospectId, body) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");
  const access = await resolveSharedAccess(supabase, userId, prospectId);
  if (access.permission !== "owner" && access.permission !== "edit") {
    throw new ServiceError("Solo lectura: no puedes editar este expediente.", 403);
  }
  const patch = bodyToProspectPatch(body);
  if (!Object.keys(patch).length) throw new ServiceError("Sin campos para actualizar.");
  const { data, error } = await supabase
    .from("prospects")
    .update(patch)
    .eq("id", prospectId)
    .select()
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 400);
  return assertFound(data, "Expediente no encontrado.");
}
