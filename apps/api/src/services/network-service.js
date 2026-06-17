import { isUuid } from "@salesapp/shared/data/mappers.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import {
  notifyConnectionAccepted,
  notifyConnectionRequest,
} from "./push-notifications-service.js";

function profileName(profile) {
  return profile?.full_name?.trim() || profile?.email?.split("@")[0] || "Usuario";
}

async function loadProfiles(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, last_seen_at")
    .in("id", unique);
  if (error) throw new ServiceError(error.message, 500);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

function mapConnection(row, userId, profiles) {
  const isOutgoing = row.requester_id === userId;
  const peerId = isOutgoing ? row.addressee_id : row.requester_id;
  const peer = profiles.get(peerId);
  return {
    id: row.id,
    status: row.status,
    direction: isOutgoing ? "outgoing" : "incoming",
    created_at: row.created_at,
    updated_at: row.updated_at,
    peer: peer ? {
      id: peer.id,
      full_name: peer.full_name,
      email: peer.email,
      avatar_url: peer.avatar_url,
      last_seen_at: peer.last_seen_at,
    } : { id: peerId, full_name: null, email: null, avatar_url: null, last_seen_at: null },
  };
}

export async function searchUsers(supabase, userId, query, limit = 20) {
  const q = String(query ?? "").trim();
  if (q.length < 2) return [];
  const { data, error } = await supabase.rpc("search_profiles", {
    search_q: q,
    result_limit: limit,
  });
  if (error) throw new ServiceError(error.message, 500);
  return (data ?? []).filter((row) => row.id !== userId);
}

export async function listConnections(supabase, userId, { status } = {}) {
  let q = supabase
    .from("user_connections")
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order("updated_at", { ascending: false });
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw new ServiceError(error.message, 500);
  const rows = data ?? [];
  const profiles = await loadProfiles(supabase, rows.flatMap((r) => [r.requester_id, r.addressee_id]));
  return rows.map((row) => mapConnection(row, userId, profiles));
}

export async function sendConnectionRequest(supabase, userId, addresseeId) {
  if (!isUuid(addresseeId)) throw new ServiceError("Usuario inválido.");
  if (addresseeId === userId) throw new ServiceError("No puedes agregarte a ti mismo.");

  const { data: existing } = await supabase
    .from("user_connections")
    .select("id, status, requester_id, addressee_id")
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${userId})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === "accepted") throw new ServiceError("Ya son contactos.");
    if (existing.status === "blocked") throw new ServiceError("No se puede enviar solicitud.");
    if (existing.status === "pending") {
      if (existing.addressee_id === userId) {
        return updateConnectionStatus(supabase, userId, existing.id, "accepted");
      }
      throw new ServiceError("Solicitud pendiente.");
    }
  }

  const { data, error } = await supabase
    .from("user_connections")
    .insert({ requester_id: userId, addressee_id: addresseeId, status: "pending" })
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  const profiles = await loadProfiles(supabase, [data.requester_id, data.addressee_id]);
  const requester = profiles.get(data.requester_id);
  notifyConnectionRequest(data.addressee_id, {
    requesterId: userId,
    requesterName: profileName(requester),
  }).catch(() => {});
  return mapConnection(data, userId, profiles);
}

export async function updateConnectionStatus(supabase, userId, connectionId, status) {
  if (!isUuid(connectionId)) throw new ServiceError("Conexión inválida.");
  if (!["accepted", "blocked", "pending"].includes(status)) {
    throw new ServiceError("Estado inválido.");
  }

  const { data: row, error: fetchErr } = await supabase
    .from("user_connections")
    .select("*")
    .eq("id", connectionId)
    .maybeSingle();
  if (fetchErr) throw new ServiceError(fetchErr.message, 500);
  assertFound(row, "Conexión no encontrada.");

  const isParticipant = row.requester_id === userId || row.addressee_id === userId;
  if (!isParticipant) throw new ServiceError("Sin permiso.", 403);

  if (status === "accepted" && row.addressee_id !== userId) {
    throw new ServiceError("Solo el destinatario puede aceptar.", 403);
  }

  const { data, error } = await supabase
    .from("user_connections")
    .update({ status })
    .eq("id", connectionId)
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);
  const profiles = await loadProfiles(supabase, [data.requester_id, data.addressee_id]);
  if (status === "accepted") {
    const accepter = profiles.get(userId);
    notifyConnectionAccepted(data.requester_id, {
      peerId: userId,
      peerName: profileName(accepter),
    }).catch(() => {});
  }
  return mapConnection(data, userId, profiles);
}

export async function removeConnection(supabase, userId, connectionId) {
  if (!isUuid(connectionId)) throw new ServiceError("Conexión inválido.");

  const { data: row, error: fetchErr } = await supabase
    .from("user_connections")
    .select("requester_id, addressee_id")
    .eq("id", connectionId)
    .maybeSingle();
  if (fetchErr) throw new ServiceError(fetchErr.message, 500);
  assertFound(row, "Conexión no encontrada.");

  const isParticipant = row.requester_id === userId || row.addressee_id === userId;
  if (!isParticipant) throw new ServiceError("Sin permiso.", 403);

  const peerId = row.requester_id === userId ? row.addressee_id : row.requester_id;
  const { error: revokeErr } = await supabase.rpc("revoke_mutual_shares", { peer_id: peerId });
  if (revokeErr) throw new ServiceError(revokeErr.message, 500);

  const { error, count } = await supabase
    .from("user_connections")
    .delete({ count: "exact" })
    .eq("id", connectionId)
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw new ServiceError(error.message, 400);
  if (!count) throw new ServiceError("Conexión no encontrada.", 404);
  return { ok: true };
}

export async function getConnectionWithContact(supabase, userId, contactId) {
  if (!isUuid(contactId)) throw new ServiceError("Contacto inválido.");
  const { data, error } = await supabase
    .from("user_connections")
    .select("id, requester_id, addressee_id, status, created_at, updated_at")
    .eq("status", "accepted")
    .or(`and(requester_id.eq.${userId},addressee_id.eq.${contactId}),and(requester_id.eq.${contactId},addressee_id.eq.${userId})`)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!data) throw new ServiceError("Contacto no encontrado.", 404);
  const profiles = await loadProfiles(supabase, [userId, contactId]);
  return mapConnection(data, userId, profiles);
}
