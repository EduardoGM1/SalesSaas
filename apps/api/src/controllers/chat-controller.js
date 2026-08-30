/**
 * HTTP de chat de expediente.
 */
import * as chatService from "../services/chat-service.js";

export async function asegurarConversacionExpediente(auth, req) {
  return chatService.ensureProspectConversation(auth.supabase, auth.userId, req.params.id);
}

export async function listarConversacionesExpediente(auth) {
  return chatService.listExpedienteConversations(auth.supabase, auth.userId);
}

export async function obtenerConversacion(auth, req) {
  return chatService.getConversation(auth.supabase, auth.userId, req.params.id);
}

export async function listarMensajesConversacion(auth, req) {
  return chatService.listConversationMessages(auth.supabase, auth.userId, req.params.id, {
    limit: req.query.limit,
  });
}

export async function enviarMensajeConversacion(auth, req, body) {
  return chatService.sendConversationMessage(auth.supabase, auth.userId, req.params.id, body);
}
