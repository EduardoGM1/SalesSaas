/**
 * Chat grupal por expediente (sala).
 * Conversaciones multiparte: vendedor + gerente + cerrador.
 */
import { isUuid } from "@salesapp/shared/data/mappers.js";
import { ServiceError, assertFound } from "../lib/service-error.js";
import { createServiceSupabaseClient } from "../lib/supabase-server.js";
import { getRequestWorkspaceId } from "../lib/workspace-scope.js";
import { profileDisplayName } from "../lib/profile-display-name.js";
import { notifyNewMessage } from "./push-notifications-service.js";

const MSG_TYPES = new Set(["text", "prospect_card", "system"]);

function adminClient() {
  const client = createServiceSupabaseClient();
  if (!client) throw new ServiceError("Service role no configurado.", 500);
  return client;
}

async function assertActiveMember(admin, conversationId, userId) {
  const { data, error } = await admin
    .from("chat_members")
    .select("usuario_id, rol")
    .eq("conversation_id", conversationId)
    .eq("usuario_id", userId)
    .is("left_at", null)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  if (!data) throw new ServiceError("No perteneces a esta conversación.", 403);
  return data;
}

async function loadProfiles(admin, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, avatar_url")
    .in("id", unique);
  if (error) throw new ServiceError(error.message, 500);
  return new Map((data ?? []).map((p) => [p.id, p]));
}

/** Lista chats de expediente activos del workspace (usuario es miembro). */
export async function listExpedienteConversations(supabase, userId) {
  const workspaceId = await getRequestWorkspaceId(supabase, userId);
  if (!workspaceId) throw new ServiceError("Workspace activo requerido.", 403);
  const admin = adminClient();

  const { data: memberships, error } = await admin
    .from("chat_members")
    .select("conversation_id, rol, joined_at")
    .eq("usuario_id", userId)
    .is("left_at", null);
  if (error) throw new ServiceError(error.message, 500);
  const ids = (memberships || []).map((m) => m.conversation_id);
  if (!ids.length) return [];

  const { data: convos, error: cErr } = await admin
    .from("chat_conversations")
    .select("id, workspace_id, prospect_id, titulo, updated_at, prospects(id, name, name1, prospect_code)")
    .eq("workspace_id", workspaceId)
    .eq("tipo", "expediente")
    .in("id", ids)
    .order("updated_at", { ascending: false });
  if (cErr) throw new ServiceError(cErr.message, 500);

  const lastByConv = new Map();
  for (const id of ids) {
    const { data: last } = await admin
      .from("chat_messages")
      .select("id, body, message_type, created_at, sender_id")
      .eq("conversation_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last) lastByConv.set(id, last);
  }

  return (convos || []).map((c) => {
    const last = lastByConv.get(c.id);
    const prospect = c.prospects;
    const title = c.titulo
      || prospect?.name1
      || prospect?.name
      || prospect?.prospect_code
      || "Expediente";
    return {
      id: c.id,
      prospect_id: c.prospect_id,
      titulo: title,
      prospect_code: prospect?.prospect_code || null,
      updated_at: c.updated_at,
      last_message: last
        ? {
          body: last.message_type === "prospect_card" ? "📁 Expediente" : last.body,
          created_at: last.created_at,
          sender_id: last.sender_id,
        }
        : null,
    };
  });
}

/** Mensajes de una conversación de expediente. */
export async function listConversationMessages(_supabase, userId, conversationId, { limit = 100 } = {}) {
  if (!isUuid(conversationId)) throw new ServiceError("Conversación inválida.");
  const admin = adminClient();
  await assertActiveMember(admin, conversationId, userId);

  const take = Math.min(Math.max(Number(limit) || 100, 1), 200);
  const { data, error } = await admin
    .from("chat_messages")
    .select("id, conversation_id, sender_id, body, message_type, metadata, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(take);
  if (error) throw new ServiceError(error.message, 500);

  const profiles = await loadProfiles(admin, (data || []).map((m) => m.sender_id));
  const { data: members } = await admin
    .from("chat_members")
    .select("usuario_id, rol")
    .eq("conversation_id", conversationId)
    .is("left_at", null);

  return {
    messages: (data || []).map((row) => {
      const profile = profiles.get(row.sender_id);
      return {
        id: row.id,
        body: row.body,
        message_type: row.message_type,
        metadata: row.metadata || {},
        created_at: row.created_at,
        sender_id: row.sender_id,
        mine: row.sender_id === userId,
        sender: {
          id: row.sender_id,
          full_name: profileDisplayName(profile),
          avatar_url: profile?.avatar_url || null,
        },
      };
    }),
    members: (members || []).map((m) => ({ usuario_id: m.usuario_id, rol: m.rol })),
  };
}

/** Envía mensaje al chat del expediente. */
export async function sendConversationMessage(_supabase, userId, conversationId, body = {}) {
  if (!isUuid(conversationId)) throw new ServiceError("Conversación inválida.");
  const admin = adminClient();
  await assertActiveMember(admin, conversationId, userId);

  const type = MSG_TYPES.has(body.message_type) ? body.message_type : "text";
  const text = String(body.body || "").trim();
  if (type === "text" && !text) throw new ServiceError("Mensaje vacío.", 400);
  if (text.length > 4000) throw new ServiceError("Mensaje demasiado largo.", 400);

  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  if (type === "prospect_card" && !metadata.prospect_id) {
    const { data: conv } = await admin
      .from("chat_conversations")
      .select("prospect_id, titulo")
      .eq("id", conversationId)
      .maybeSingle();
    metadata.prospect_id = conv?.prospect_id;
    metadata.prospect_name = conv?.titulo;
  }

  const { data, error } = await admin
    .from("chat_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: userId,
      body: text || (type === "prospect_card" ? "Expediente" : ""),
      message_type: type,
      metadata,
    })
    .select("id, conversation_id, sender_id, body, message_type, metadata, created_at")
    .single();
  if (error) throw new ServiceError(error.message, 400);

  await admin
    .from("chat_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  const { data: peers } = await admin
    .from("chat_members")
    .select("usuario_id")
    .eq("conversation_id", conversationId)
    .is("left_at", null)
    .neq("usuario_id", userId);

  const { data: sender } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  const senderName = profileDisplayName(sender, "Alguien");
  const preview = type === "prospect_card" ? `📁 ${metadata.prospect_name || "Expediente"}` : text;

  await Promise.all(
    (peers || []).map((peer) => notifyNewMessage(peer.usuario_id, {
      senderId: userId,
      senderName,
      body: preview,
      conversationId,
    }).catch(() => {})),
  );

  return {
    ...data,
    mine: true,
    sender: { id: userId, full_name: senderName, avatar_url: null },
  };
}

/** Resuelve o crea el chat del expediente y lo sincroniza. */
export async function ensureProspectConversation(_supabase, userId, prospectId) {
  if (!isUuid(prospectId)) throw new ServiceError("Expediente inválido.");
  const admin = adminClient();

  // AuthZ ANTES del RPC (service-role): evita sync sobre expedientes ajenos.
  const { data: prospect, error: prospectError } = await admin
    .from("prospects")
    .select("id, user_id, workspace_id")
    .eq("id", prospectId)
    .maybeSingle();
  if (prospectError) throw new ServiceError(prospectError.message, 500);
  assertFound(prospect, "Expediente no encontrado.");

  const [{ data: profile }, { data: member }, { data: workflow }] = await Promise.all([
    admin.from("profiles").select("is_super_admin").eq("id", userId).maybeSingle(),
    admin
      .from("workspace_miembros")
      .select("rol_en_workspace")
      .eq("workspace_id", prospect.workspace_id)
      .eq("usuario_id", userId)
      .maybeSingle(),
    admin
      .from("prospect_workflows")
      .select("gerente_id, representante_id, cerrador_id")
      .eq("prospect_id", prospectId)
      .maybeSingle(),
  ]);

  const isSuper = profile?.is_super_admin === true;
  const isParticipant = Boolean(
    prospect.user_id === userId
    || member?.rol_en_workspace === "gerente"
    || workflow?.gerente_id === userId
    || workflow?.representante_id === userId
    || workflow?.cerrador_id === userId,
  );
  if (!isSuper && !isParticipant && !member) {
    throw new ServiceError("No puedes acceder al chat de este expediente.", 403);
  }
  if (!isSuper && !isParticipant) {
    throw new ServiceError("Solo los participantes del expediente pueden abrir su chat.", 403);
  }

  const { data: convId, error } = await admin.rpc("sync_prospect_chat_members", {
    p_prospect_id: prospectId,
  });
  if (error) {
    if (/does not exist|schema cache/i.test(error.message || "")) {
      throw new ServiceError("Chat de expediente no disponible. Aplica la migración 0059.", 503);
    }
    throw new ServiceError(error.message, 400);
  }
  assertFound(convId, "No se pudo crear el chat del expediente.");
  await assertActiveMember(admin, convId, userId);
  return { id: convId, prospect_id: prospectId };
}

/** Detalle de conversación (título + miembros). */
export async function getConversation(_supabase, userId, conversationId) {
  if (!isUuid(conversationId)) throw new ServiceError("Conversación inválida.");
  const admin = adminClient();
  await assertActiveMember(admin, conversationId, userId);
  const { data, error } = await admin
    .from("chat_conversations")
    .select("id, workspace_id, prospect_id, titulo, updated_at, prospects(id, name, name1, prospect_code)")
    .eq("id", conversationId)
    .maybeSingle();
  if (error) throw new ServiceError(error.message, 500);
  assertFound(data, "Conversación no encontrada.");

  const { data: members } = await admin
    .from("chat_members")
    .select("usuario_id, rol")
    .eq("conversation_id", conversationId)
    .is("left_at", null);
  const profiles = await loadProfiles(admin, (members || []).map((m) => m.usuario_id));

  return {
    id: data.id,
    prospect_id: data.prospect_id,
    titulo: data.titulo
      || data.prospects?.name1
      || data.prospects?.name
      || data.prospects?.prospect_code
      || "Expediente",
    updated_at: data.updated_at,
    members: (members || []).map((m) => {
      const p = profiles.get(m.usuario_id);
      return {
        id: m.usuario_id,
        rol: m.rol,
        full_name: profileDisplayName(p),
        avatar_url: p?.avatar_url || null,
      };
    }),
  };
}
