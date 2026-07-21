import { isUuid } from "@salesapp/shared/data/mappers.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { profileDisplayName } from "../lib/profile-display-name.js";
import { notifyNewMessage } from "./push-notifications-service.js";

export const MESSAGE_TYPES = Object.freeze({
  TEXT: "text",
  ACCESS_GRANTED: "access_granted",
  PERMISSION_REQUEST: "permission_request",
  PERMISSION_RESPONSE: "permission_response",
});

const STRUCTURED_TYPES = new Set([
  MESSAGE_TYPES.ACCESS_GRANTED,
  MESSAGE_TYPES.PERMISSION_REQUEST,
  MESSAGE_TYPES.PERMISSION_RESPONSE,
]);

async function loadProfiles(supabase, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, email, avatar_url, settings")
    .in("id", unique);
  if (error) throw new ServiceError(error.message, 500);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

function peerPublic(profile, peerId) {
  if (!profile) return { id: peerId, full_name: null, avatar_url: null };
  return {
    id: profile.id,
    full_name: profileDisplayName(profile),
    avatar_url: profile.avatar_url,
  };
}

const MSG_SELECT = "id, sender_id, recipient_id, body, read_at, created_at, message_type, metadata";

function mapMessage(row, userId, profiles) {
  const peerId = row.sender_id === userId ? row.recipient_id : row.sender_id;
  const peer = profiles.get(peerId);
  return {
    id: row.id,
    body: row.body,
    message_type: row.message_type || MESSAGE_TYPES.TEXT,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    created_at: row.created_at,
    read_at: row.read_at,
    sender_id: row.sender_id,
    recipient_id: row.recipient_id,
    mine: row.sender_id === userId,
    peer: peerPublic(peer, peerId),
  };
}

function previewBody(row) {
  const type = row.message_type || MESSAGE_TYPES.TEXT;
  if (type === MESSAGE_TYPES.ACCESS_GRANTED) {
    const name = row.metadata?.prospect_name || "expediente";
    return `📁 ${name}`;
  }
  if (type === MESSAGE_TYPES.PERMISSION_REQUEST) {
    return "🔑 Solicitud de permiso";
  }
  if (type === MESSAGE_TYPES.PERMISSION_RESPONSE) {
    return row.metadata?.decision === "approved"
      ? "✅ Permiso actualizado"
      : "❌ Solicitud rechazada";
  }
  return row.body;
}

export async function listConversations(supabase, userId) {
  const { data, error } = await supabase
    .from("direct_messages")
    .select(MSG_SELECT)
    .or(`sender_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new ServiceError(error.message, 500);

  const profiles = await loadProfiles(
    supabase,
    (data ?? []).flatMap((r) => [r.sender_id, r.recipient_id]),
  );

  const byPeer = new Map();
  for (const row of data ?? []) {
    const peerId = row.sender_id === userId ? row.recipient_id : row.sender_id;
    if (!byPeer.has(peerId)) {
      const unread = row.recipient_id === userId && !row.read_at ? 1 : 0;
      const peer = profiles.get(peerId);
      byPeer.set(peerId, {
        kind: "direct",
        peer: peerPublic(peer, peerId),
        last_message: {
          body: previewBody(row),
          message_type: row.message_type || MESSAGE_TYPES.TEXT,
          created_at: row.created_at,
          mine: row.sender_id === userId,
        },
        unread_count: unread,
      });
    } else if (row.recipient_id === userId && !row.read_at) {
      byPeer.get(peerId).unread_count += 1;
    }
  }

  let groups = [];
  try {
    const { listGroupConversations } = await import("./group-chat-service.js");
    groups = await listGroupConversations(supabase, userId);
  } catch {
    groups = [];
  }

  const merged = [...byPeer.values(), ...groups];
  merged.sort((a, b) => {
    const ta = a.last_message?.created_at || "";
    const tb = b.last_message?.created_at || "";
    return tb.localeCompare(ta);
  });
  return merged;
}

export async function listMessagesWithUser(supabase, userId, peerId, { limit = 100 } = {}) {
  if (!isUuid(peerId)) throw new ServiceError("Usuario inválido.");
  const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
  // Más recientes primero; luego invertimos para render cronológico ASC.
  const { data, error } = await supabase
    .from("direct_messages")
    .select(MSG_SELECT)
    .or(`and(sender_id.eq.${userId},recipient_id.eq.${peerId}),and(sender_id.eq.${peerId},recipient_id.eq.${userId})`)
    .order("created_at", { ascending: false })
    .limit(take);
  if (error) throw new ServiceError(error.message, 500);
  const profiles = await loadProfiles(supabase, [userId, peerId]);
  const chronological = [...(data ?? [])].reverse();
  return chronological.map((row) => mapMessage(row, userId, profiles));
}

export async function sendMessage(supabase, userId, { recipient_id: recipientId, body }) {
  if (!isUuid(recipientId)) throw new ServiceError("Destinatario inválido.");
  const text = String(body ?? "").trim();
  if (!text) throw new ServiceError("Mensaje vacío.");
  if (recipientId === userId) throw new ServiceError("No puedes enviarte mensajes a ti mismo.");

  const { data, error } = await supabase
    .from("direct_messages")
    .insert({
      sender_id: userId,
      recipient_id: recipientId,
      body: text,
      message_type: MESSAGE_TYPES.TEXT,
      metadata: {},
    })
    .select(MSG_SELECT)
    .single();
  if (error) {
    if (error.message?.includes("row-level security")) {
      throw new ServiceError("Solo puedes escribir a contactos aceptados.", 403);
    }
    throw new ServiceError(error.message, 400);
  }
  const profiles = await loadProfiles(supabase, [userId, recipientId]);
  const mapped = mapMessage(data, userId, profiles);
  const senderProfile = profiles.get(userId);
  notifyNewMessage(recipientId, {
    senderId: userId,
    senderName: profileDisplayName(senderProfile),
    body: text,
  }).catch(() => {});
  return mapped;
}

/**
 * Inserta un mensaje estructurado (solo para servicios internos de share).
 * @param {object} [client] - cliente supabase (user o service role)
 */
export async function sendStructuredMessage(client, {
  senderId,
  recipientId,
  body,
  messageType,
  metadata = {},
  notify = true,
}) {
  if (!isUuid(senderId) || !isUuid(recipientId)) throw new ServiceError("Participantes inválidos.");
  if (!STRUCTURED_TYPES.has(messageType)) throw new ServiceError("Tipo de mensaje inválido.");
  const text = String(body ?? "").trim();
  if (!text) throw new ServiceError("Mensaje vacío.");

  const { data, error } = await client
    .from("direct_messages")
    .insert({
      sender_id: senderId,
      recipient_id: recipientId,
      body: text,
      message_type: messageType,
      metadata: metadata || {},
    })
    .select(MSG_SELECT)
    .single();
  if (error) {
    if (error.message?.includes("row-level security")) {
      throw new ServiceError("Solo puedes escribir a contactos aceptados.", 403);
    }
    throw new ServiceError(error.message, 400);
  }

  if (notify) {
    const profiles = await loadProfiles(client, [senderId]);
    notifyNewMessage(recipientId, {
      senderId,
      senderName: profileDisplayName(profiles.get(senderId)),
      body: text,
    }).catch(() => {});
  }

  return data;
}

export async function markThreadRead(supabase, userId, peerId) {
  if (!isUuid(peerId)) throw new ServiceError("Usuario inválido.");
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("direct_messages")
    .update({ read_at: now })
    .eq("recipient_id", userId)
    .eq("sender_id", peerId)
    .is("read_at", null);
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}

export async function countUnread(supabase, userId) {
  const { count, error } = await supabase
    .from("direct_messages")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);
  if (error) throw new ServiceError(error.message, 500);
  let groupUnread = 0;
  try {
    const { countGroupUnread } = await import("./group-chat-service.js");
    groupUnread = await countGroupUnread(supabase, userId);
  } catch {
    groupUnread = 0;
  }
  return { count: (count ?? 0) + groupUnread };
}

export async function getMessage(supabase, userId, messageId) {
  if (!isUuid(messageId)) throw new ServiceError("Mensaje inválido.");
  const { data, error } = await supabase
    .from("direct_messages")
    .select(MSG_SELECT)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  const row = assertFound(data, "Mensaje no encontrado.");
  if (row.sender_id !== userId && row.recipient_id !== userId) {
    throw new ServiceError("Sin permiso.", 403);
  }
  const profiles = await loadProfiles(supabase, [row.sender_id, row.recipient_id]);
  return mapMessage(row, userId, profiles);
}
