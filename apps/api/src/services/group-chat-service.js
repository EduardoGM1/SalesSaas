import { isUuid } from "@salesapp/shared/data/mappers.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { profileDisplayName } from "../lib/profile-display-name.js";
import { notifyNewMessage } from "./push-notifications-service.js";
import { MESSAGE_TYPES } from "./messages-service.js";

const MSG_SELECT = "id, conversation_id, sender_id, body, message_type, metadata, created_at";

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

function previewBody(row) {
  const type = row.message_type || MESSAGE_TYPES.TEXT;
  if (type === MESSAGE_TYPES.ACCESS_GRANTED) {
    return `📁 ${row.metadata?.prospect_name || "expediente"}`;
  }
  if (type === MESSAGE_TYPES.PERMISSION_REQUEST) return "🔑 Solicitud de permiso";
  if (type === MESSAGE_TYPES.PERMISSION_RESPONSE) {
    return row.metadata?.decision === "approved" ? "✅ Permiso actualizado" : "❌ Solicitud rechazada";
  }
  return row.body;
}

async function assertParticipant(supabase, conversationId, userId) {
  const { data, error } = await supabase
    .from("chat_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!data) throw new ServiceError("No perteneces a esta conversación.", 403);
}

export async function listGroupConversations(supabase, userId) {
  const { data: parts, error } = await supabase
    .from("chat_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId);
  if (error) {
    // Migración 0052 aún no aplicada
    if (String(error.message || "").includes("chat_participants")) return [];
    throw new ServiceError(error.message, 500);
  }
  if (!parts?.length) return [];

  const convIds = parts.map((p) => p.conversation_id);
  const lastReadByConv = new Map(parts.map((p) => [p.conversation_id, p.last_read_at]));

  const { data: convs, error: cErr } = await supabase
    .from("chat_conversations")
    .select("id, kind, name, grupo_id, created_at")
    .in("id", convIds)
    .eq("kind", "group");
  if (cErr) throw new ServiceError(cErr.message, 500);

  // Una sola pasada de mensajes recientes (evita N+1 por conversación)
  const { data: recentMsgs } = await supabase
    .from("chat_messages")
    .select(MSG_SELECT)
    .in("conversation_id", convIds)
    .order("created_at", { ascending: false })
    .limit(Math.min(convIds.length * 40, 400));

  const lastByConv = new Map();
  const unreadByConv = new Map();
  for (const msg of recentMsgs ?? []) {
    if (!lastByConv.has(msg.conversation_id)) lastByConv.set(msg.conversation_id, msg);
    if (msg.sender_id === userId) continue;
    const lastRead = lastReadByConv.get(msg.conversation_id);
    if (lastRead && msg.created_at <= lastRead) continue;
    unreadByConv.set(msg.conversation_id, (unreadByConv.get(msg.conversation_id) || 0) + 1);
  }

  const out = (convs ?? []).map((conv) => {
    const last = lastByConv.get(conv.id) || null;
    return {
      kind: "group",
      conversation_id: conv.id,
      grupo_id: conv.grupo_id,
      name: conv.name || "Equipo",
      last_message: last
        ? {
            body: previewBody(last),
            message_type: last.message_type || MESSAGE_TYPES.TEXT,
            created_at: last.created_at,
            mine: last.sender_id === userId,
          }
        : null,
      unread_count: unreadByConv.get(conv.id) || 0,
    };
  });
  out.sort((a, b) => {
    const ta = a.last_message?.created_at || "";
    const tb = b.last_message?.created_at || "";
    return tb.localeCompare(ta);
  });
  return out;
}

export async function listGroupMessages(supabase, userId, conversationId, { limit = 100 } = {}) {
  if (!isUuid(conversationId)) throw new ServiceError("Conversación inválida.");
  await assertParticipant(supabase, conversationId, userId);
  const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MSG_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(take);
  if (error) throw new ServiceError(error.message, 500);

  const senderIds = (data ?? []).map((r) => r.sender_id);
  const profiles = await loadProfiles(supabase, senderIds);
  const chronological = [...(data ?? [])].reverse();
  return chronological.map((row) => ({
    id: row.id,
    body: row.body,
    message_type: row.message_type || MESSAGE_TYPES.TEXT,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    created_at: row.created_at,
    sender_id: row.sender_id,
    conversation_id: row.conversation_id,
    mine: row.sender_id === userId,
    peer: {
      id: row.sender_id,
      full_name: profileDisplayName(profiles.get(row.sender_id)),
      avatar_url: profiles.get(row.sender_id)?.avatar_url ?? null,
    },
  }));
}

export async function sendGroupMessage(supabase, userId, { conversation_id: conversationId, body }) {
  if (!isUuid(conversationId)) throw new ServiceError("Conversación inválida.");
  const text = String(body ?? "").trim();
  if (!text) throw new ServiceError("Mensaje vacío.");
  await assertParticipant(supabase, conversationId, userId);

  const { data, error } = await supabase
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: text,
      message_type: MESSAGE_TYPES.TEXT,
      metadata: {},
    })
    .select(MSG_SELECT)
    .single();
  if (error) throw new ServiceError(error.message, 400);

  const { data: members } = await supabase
    .from("chat_participants")
    .select("user_id")
    .eq("conversation_id", conversationId);
  const { data: conv } = await supabase
    .from("chat_conversations")
    .select("name")
    .eq("id", conversationId)
    .maybeSingle();
  const profiles = await loadProfiles(supabase, [userId]);
  const senderName = profileDisplayName(profiles.get(userId));
  const groupName = conv?.name || "Equipo";
  for (const m of members ?? []) {
    if (m.user_id === userId) continue;
    notifyNewMessage(m.user_id, {
      senderId: userId,
      senderName,
      body: text,
      conversationId,
      groupName,
    }).catch(() => {});
  }

  return {
    id: data.id,
    body: data.body,
    message_type: data.message_type,
    metadata: data.metadata || {},
    created_at: data.created_at,
    sender_id: data.sender_id,
    conversation_id: data.conversation_id,
    mine: true,
    peer: { id: userId, full_name: senderName, avatar_url: profiles.get(userId)?.avatar_url ?? null },
  };
}

export async function sendGroupStructuredMessage(client, {
  conversationId,
  senderId,
  body,
  messageType,
  metadata = {},
  notify = true,
}) {
  if (!isUuid(conversationId) || !isUuid(senderId)) throw new ServiceError("Datos inválidos.");
  const text = String(body ?? "").trim();
  if (!text) throw new ServiceError("Mensaje vacío.");

  const { data, error } = await client
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: senderId,
      body: text,
      message_type: messageType,
      metadata: metadata || {},
    })
    .select(MSG_SELECT)
    .single();
  if (error) throw new ServiceError(error.message, 400);

  if (notify) {
    const { data: members } = await client
      .from("chat_participants")
      .select("user_id")
      .eq("conversation_id", conversationId);
    const { data: conv } = await client
      .from("chat_conversations")
      .select("name")
      .eq("id", conversationId)
      .maybeSingle();
    const profiles = await loadProfiles(client, [senderId]);
    const senderName = profileDisplayName(profiles.get(senderId));
    const groupName = conv?.name || "Equipo";
    for (const m of members ?? []) {
      if (m.user_id === senderId) continue;
      notifyNewMessage(m.user_id, {
        senderId,
        senderName,
        body: text,
        conversationId,
        groupName,
      }).catch(() => {});
    }
  }
  return data;
}

export async function markGroupRead(supabase, userId, conversationId) {
  if (!isUuid(conversationId)) throw new ServiceError("Conversación inválida.");
  await assertParticipant(supabase, conversationId, userId);
  const { error } = await supabase
    .from("chat_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (error) throw new ServiceError(error.message, 400);
  return { ok: true };
}

export async function countGroupUnread(supabase, userId) {
  const { data: parts, error } = await supabase
    .from("chat_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId);
  if (error) {
    if (String(error.message || "").includes("chat_participants")) return 0;
    throw new ServiceError(error.message, 500);
  }
  let total = 0;
  for (const p of parts ?? []) {
    let q = supabase
      .from("chat_messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", p.conversation_id)
      .neq("sender_id", userId);
    if (p.last_read_at) q = q.gt("created_at", p.last_read_at);
    const { count } = await q;
    total += count ?? 0;
  }
  return total;
}

export async function getConversationForGrupo(supabase, grupoId) {
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, name, grupo_id")
    .eq("grupo_id", grupoId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  return data;
}

export async function listMyGroupChatsForShare(supabase, userId) {
  return listGroupConversations(supabase, userId);
}
