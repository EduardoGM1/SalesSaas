/**
 * HTTP de mensajes 1:1. `with` es obligatorio en hilo y marcar leído.
 */
import { ServiceError } from "../lib/service-error.js";
import * as messagesService from "../services/messages-service.js";

export async function listarConversaciones(auth) {
  return messagesService.listConversations(auth.supabase, auth.userId);
}

export async function contarNoLeidos(auth) {
  return messagesService.countUnread(auth.supabase, auth.userId);
}

export async function listarMensajesCon(auth, req) {
  const withUser = req.query.with;
  if (!withUser) throw new ServiceError("Parámetro with requerido.");
  return messagesService.listMessagesWithUser(auth.supabase, auth.userId, withUser);
}

export async function enviarMensaje(auth, _req, body) {
  return messagesService.sendMessage(auth.supabase, auth.userId, body);
}

export async function marcarHiloLeido(auth, req) {
  const withUser = req.query.with;
  if (!withUser) throw new ServiceError("Parámetro with requerido.");
  return messagesService.markThreadRead(auth.supabase, auth.userId, withUser);
}
