import { randomBytes } from "node:crypto";
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { bodyToProspectPatch } from "@salesapp/shared/api/validators.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { notifyProspectShared } from "./push-notifications-service.js";
import { MESSAGE_TYPES, sendStructuredMessage } from "./messages-service.js";

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

const VALID_PERMISSIONS = ["view", "edit", "comment", "workspace"];

const PERM_LABEL = {
  view: "solo lectura",
  edit: "edición",
  comment: "comentario",
  workspace: "agregar a su espacio",
};

function canEditPermission(permission) {
  return permission === "edit" || permission === "workspace" || permission === "owner";
}

function canPinPermission(permission) {
  return permission === "edit" || permission === "workspace";
}

function mapShare(row, profiles, prospects) {
  const prospect = prospects.get(row.prospect_id);
  return {
    id: row.id,
    prospect_id: row.prospect_id,
    owner_id: row.owner_id,
    shared_with_id: row.shared_with_id,
    permission: row.permission,
    added_to_workspace_at: row.added_to_workspace_at ?? null,
    created_at: row.created_at,
    prospect_name: prospectDisplayName(prospect),
    prospect_code: prospect?.prospect_code,
    shared_with: profiles.get(row.shared_with_id) ?? null,
    owner: profiles.get(row.owner_id) ?? null,
  };
}

/** Asegura conexión accepted entre A y B (para redeem de invite externo). */
async function ensureAcceptedConnection(admin, userA, userB) {
  const { data: existing } = await admin
    .from("user_connections")
    .select("id, status, requester_id, addressee_id")
    .or(`and(requester_id.eq.${userA},addressee_id.eq.${userB}),and(requester_id.eq.${userB},addressee_id.eq.${userA})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") return existing;
    if (existing.status === "blocked") {
      throw new ServiceError("No se puede conectar con este usuario.", 403);
    }
    const { data, error } = await admin
      .from("user_connections")
      .update({ status: "accepted" })
      .eq("id", existing.id)
      .select("id, status")
      .single();
    if (error) throw new ServiceError(error.message, 400);
    return data;
  }

  const { data, error } = await admin
    .from("user_connections")
    .insert({ requester_id: userA, addressee_id: userB, status: "accepted" })
    .select("id, status")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  return data;
}

async function postAccessGrantedMessage(client, {
  ownerId,
  recipientId,
  shareId,
  prospectId,
  prospectName,
  prospectCode,
  permission,
}) {
  const label = PERM_LABEL[permission] || permission;
  const body = `Te compartieron el expediente «${prospectName}» con acceso de ${label}.`;
  return sendStructuredMessage(client, {
    senderId: ownerId,
    recipientId,
    body,
    messageType: MESSAGE_TYPES.ACCESS_GRANTED,
    metadata: {
      prospect_id: prospectId,
      prospect_name: prospectName,
      prospect_code: prospectCode || null,
      share_id: shareId,
      permission,
      owner_id: ownerId,
    },
    notify: true,
  });
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
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
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
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
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
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
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
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
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

  try {
    await postAccessGrantedMessage(supabase, {
      ownerId: userId,
      recipientId: sharedWithId,
      shareId: data.id,
      prospectId,
      prospectName: mapped.prospect_name,
      prospectCode: mapped.prospect_code,
      permission,
    });
  } catch {
    // Share ya creado; no fallar el share si el mensaje tipado falla (p. ej. migración pendiente).
  }

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
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
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

export async function requestPermissionUpgrade(supabase, userId, shareId, { to_permission: toPermission = "edit" } = {}) {
  if (!isUuid(shareId)) throw new ServiceError("Compartido inválido.");
  if (!VALID_PERMISSIONS.includes(toPermission)) throw new ServiceError("Permiso inválido.");

  const { data: share, error } = await supabase
    .from("prospect_shares")
    .select("id, prospect_id, owner_id, shared_with_id, permission")
    .eq("id", shareId)
    .eq("shared_with_id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(share, "Compartido no encontrado.");

  if (share.permission === "workspace" || share.permission === "edit") {
    if (toPermission === "edit" && share.permission === "edit") {
      throw new ServiceError("Ya tienes acceso de edición.");
    }
    if (share.permission === "workspace") {
      throw new ServiceError("Ya tienes el acceso máximo.");
    }
  }
  if (share.permission === toPermission) {
    throw new ServiceError("Ya tienes ese nivel de acceso.");
  }
  if (!["edit", "workspace"].includes(toPermission)) {
    throw new ServiceError("Solo se puede solicitar edición o agregar a espacio.");
  }

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", share.prospect_id)
    .maybeSingle();
  const prospectName = prospectDisplayName(prospect);

  const { data: reqRow, error: reqErr } = await supabase
    .from("share_permission_requests")
    .insert({
      share_id: share.id,
      prospect_id: share.prospect_id,
      owner_id: share.owner_id,
      requester_id: userId,
      from_permission: share.permission,
      to_permission: toPermission,
      status: "pending",
    })
    .select("*")
    .single();
  if (reqErr) {
    if (reqErr.code === "23505" || reqErr.message?.includes("share_perm_req_one_pending")) {
      throw new ServiceError("Ya hay una solicitud pendiente para este expediente.");
    }
    throw new ServiceError(reqErr.message, 400);
  }

  const fromLabel = PERM_LABEL[share.permission] || share.permission;
  const toLabel = PERM_LABEL[toPermission] || toPermission;
  const body = `Solicité pasar de ${fromLabel} a ${toLabel} en el expediente «${prospectName}».`;

  let message;
  try {
    message = await sendStructuredMessage(supabase, {
      senderId: userId,
      recipientId: share.owner_id,
      body,
      messageType: MESSAGE_TYPES.PERMISSION_REQUEST,
      metadata: {
        prospect_id: share.prospect_id,
        prospect_name: prospectName,
        prospect_code: prospect?.prospect_code || null,
        share_id: share.id,
        request_id: reqRow.id,
        permission: share.permission,
        requested_permission: toPermission,
        owner_id: share.owner_id,
        requester_id: userId,
        status: "pending",
      },
      notify: true,
    });
    await supabase
      .from("share_permission_requests")
      .update({ request_message_id: message.id })
      .eq("id", reqRow.id);
  } catch (err) {
    await supabase.from("share_permission_requests").delete().eq("id", reqRow.id);
    throw err;
  }

  return {
    request: { ...reqRow, request_message_id: message.id },
    message,
  };
}

export async function decidePermissionRequest(supabase, userId, requestId, { decision }) {
  if (!isUuid(requestId)) throw new ServiceError("Solicitud inválida.");
  if (!["approved", "rejected"].includes(decision)) throw new ServiceError("Decisión inválida.");

  const { data: reqRow, error } = await supabase
    .from("share_permission_requests")
    .select("*")
    .eq("id", requestId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(reqRow, "Solicitud no encontrada.");
  if (reqRow.status !== "pending") throw new ServiceError("Esta solicitud ya fue resuelta.");

  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", reqRow.prospect_id)
    .maybeSingle();
  const prospectName = prospectDisplayName(prospect);

  if (decision === "approved") {
    const { error: upErr } = await supabase
      .from("prospect_shares")
      .update({ permission: reqRow.to_permission })
      .eq("id", reqRow.share_id)
      .eq("owner_id", userId);
    if (upErr) throw new ServiceError(upErr.message, 400);
  }

  const now = new Date().toISOString();
  const { data: updated, error: stErr } = await supabase
    .from("share_permission_requests")
    .update({ status: decision, resolved_at: now })
    .eq("id", requestId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (stErr) throw new ServiceError(stErr.message, 400);
  assertFound(updated, "Solicitud no encontrada.");

  const toLabel = PERM_LABEL[reqRow.to_permission] || reqRow.to_permission;
  const body = decision === "approved"
    ? `Aprobé el acceso de ${toLabel} para el expediente «${prospectName}».`
    : `Rechacé la solicitud de ${toLabel} para el expediente «${prospectName}».`;

  const message = await sendStructuredMessage(supabase, {
    senderId: userId,
    recipientId: reqRow.requester_id,
    body,
    messageType: MESSAGE_TYPES.PERMISSION_RESPONSE,
    metadata: {
      prospect_id: reqRow.prospect_id,
      prospect_name: prospectName,
      prospect_code: prospect?.prospect_code || null,
      share_id: reqRow.share_id,
      request_id: reqRow.id,
      permission: decision === "approved" ? reqRow.to_permission : reqRow.from_permission,
      requested_permission: reqRow.to_permission,
      decision,
      owner_id: userId,
      requester_id: reqRow.requester_id,
    },
    notify: true,
  });

  await supabase
    .from("share_permission_requests")
    .update({ response_message_id: message.id })
    .eq("id", requestId);

  return { request: { ...updated, response_message_id: message.id }, message };
}

export async function createShareInvite(supabase, userId, prospectId, { permission = "view" } = {}) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");
  if (!VALID_PERMISSIONS.includes(permission)) throw new ServiceError("Permiso inválido.");

  const { data: owned } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", prospectId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!owned) throw new ServiceError("Expediente no encontrado.", 404);

  const token = randomBytes(24).toString("base64url");
  const { data, error } = await supabase
    .from("prospect_share_invites")
    .insert({
      token,
      prospect_id: prospectId,
      owner_id: userId,
      permission,
    })
    .select("id, token, prospect_id, owner_id, permission, expires_at, created_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);

  return {
    ...data,
    prospect_name: prospectDisplayName(owned),
    prospect_code: owned.prospect_code,
    path: `/e/i/${data.token}`,
  };
}

export async function redeemShareInvite(supabase, userId, token) {
  const inviteToken = String(token ?? "").trim();
  if (!inviteToken) throw new ServiceError("Token inválido.");

  const admin = createServiceSupabaseClient();
  const client = admin || supabase;

  const { data: invite, error } = await client
    .from("prospect_share_invites")
    .select("*")
    .eq("token", inviteToken)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(invite, "Invitación no encontrada.");

  if (invite.revoked_at) throw new ServiceError("Esta invitación fue revocada.", 410);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    throw new ServiceError("Esta invitación expiró.", 410);
  }
  if (invite.owner_id === userId) {
    throw new ServiceError("No puedes canjear tu propia invitación.");
  }

  if (admin) {
    await ensureAcceptedConnection(admin, invite.owner_id, userId);
  }

  const writeClient = admin || supabase;
  const { data: share, error: shareErr } = await writeClient
    .from("prospect_shares")
    .upsert({
      prospect_id: invite.prospect_id,
      owner_id: invite.owner_id,
      shared_with_id: userId,
      permission: invite.permission,
    }, { onConflict: "prospect_id,shared_with_id" })
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
    .single();
  if (shareErr) {
    if (shareErr.message?.includes("row-level security")) {
      throw new ServiceError("No se pudo crear el acceso. Asegúrate de estar conectado al dueño.", 403);
    }
    throw new ServiceError(shareErr.message, 400);
  }

  await writeClient
    .from("prospect_share_invites")
    .update({ redeemed_count: (invite.redeemed_count || 0) + 1 })
    .eq("id", invite.id);

  const { data: prospect } = await writeClient
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", invite.prospect_id)
    .maybeSingle();
  const prospectName = prospectDisplayName(prospect);

  try {
    await postAccessGrantedMessage(writeClient, {
      ownerId: invite.owner_id,
      recipientId: userId,
      shareId: share.id,
      prospectId: invite.prospect_id,
      prospectName,
      prospectCode: prospect?.prospect_code,
      permission: invite.permission,
    });
  } catch {
    // Acceso ya creado.
  }

  const profiles = await loadProfiles(writeClient, [invite.owner_id, userId]);
  notifyProspectShared(userId, {
    ownerId: invite.owner_id,
    ownerName: profileName(profiles.get(invite.owner_id)),
    prospectId: invite.prospect_id,
    prospectName,
  }).catch(() => {});

  return {
    share: mapShare(share, profiles, new Map(prospect ? [[prospect.id, prospect]] : [])),
    owner_id: invite.owner_id,
    prospect_id: invite.prospect_id,
    permission: invite.permission,
    can_add_to_workspace: canPinPermission(invite.permission),
    added_to_workspace_at: share.added_to_workspace_at ?? null,
    path: `/red/contacto/${invite.owner_id}/expediente/${invite.prospect_id}`,
  };
}

export async function addShareToWorkspace(supabase, userId, shareId) {
  if (!isUuid(shareId)) throw new ServiceError("Compartido inválido.");
  const { data: share, error } = await supabase
    .from("prospect_shares")
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
    .eq("id", shareId)
    .eq("shared_with_id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(share, "Compartido no encontrado.");
  if (!canPinPermission(share.permission)) {
    throw new ServiceError("Tu permiso no permite agregar este expediente a tu espacio.", 403);
  }
  if (share.added_to_workspace_at) {
    return mapShare(share, await loadProfiles(supabase, [share.owner_id, share.shared_with_id]), new Map());
  }
  const now = new Date().toISOString();
  const { data, error: upErr } = await supabase
    .from("prospect_shares")
    .update({ added_to_workspace_at: now })
    .eq("id", shareId)
    .eq("shared_with_id", userId)
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
    .maybeSingle();
  if (upErr) throw new ServiceError(upErr.message, 400);
  assertFound(data, "Compartido no encontrado.");
  const profiles = await loadProfiles(supabase, [data.owner_id, data.shared_with_id]);
  const { data: prospect } = await supabase
    .from("prospects")
    .select("id, prospect_code, name, name1, name2")
    .eq("id", data.prospect_id)
    .maybeSingle();
  return mapShare(data, profiles, new Map(prospect ? [[prospect.id, prospect]] : []));
}

/** Expedientes pinneados en el espacio del receptor (mismo registro, no copia). */
export async function listWorkspacePinned(supabase, userId) {
  const { data, error } = await supabase
    .from("prospect_shares")
    .select("id, prospect_id, owner_id, shared_with_id, permission, added_to_workspace_at, created_at")
    .eq("shared_with_id", userId)
    .not("added_to_workspace_at", "is", null)
    .order("added_to_workspace_at", { ascending: false });
  if (error) throw new ServiceError(error.message, 500);
  const rows = data ?? [];
  const profiles = await loadProfiles(supabase, rows.flatMap((r) => [r.owner_id, r.shared_with_id]));
  const prospectIds = [...new Set(rows.map((r) => r.prospect_id))];
  const { data: prospectRows } = prospectIds.length
    ? await supabase.from("prospects").select("id, prospect_code, name, name1, name2, tour_date, city, country, status").in("id", prospectIds)
    : { data: [] };
  const prospects = new Map((prospectRows ?? []).map((p) => [p.id, p]));
  return rows.map((row) => {
    const mapped = mapShare(row, profiles, prospects);
    const p = prospects.get(row.prospect_id);
    return {
      ...mapped,
      tour_date: p?.tour_date ?? null,
      city: p?.city ?? null,
      country: p?.country ?? null,
      status: p?.status ?? null,
      href: `/red/contacto/${row.owner_id}/expediente/${row.prospect_id}`,
    };
  });
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
    .select("id, permission, owner_id, added_to_workspace_at")
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
  return {
    prospect,
    permission: share.permission,
    share_id: share.id,
    owner_id: share.owner_id,
    added_to_workspace_at: share.added_to_workspace_at ?? null,
    can_add_to_workspace: canPinPermission(share.permission),
    tools,
  };
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
  if (access.permission !== "owner" && !canEditPermission(access.permission)) {
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
  if (access.permission !== "owner" && !canEditPermission(access.permission)) {
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
