/**
 * HTTP de agenda (calendar_entries).
 */
import { parseLimitOffset } from "../lib/http.js";
import * as agendaService from "../services/calendar-service.js";

export async function listarEntradas(auth, req) {
  const paging = parseLimitOffset(req.query);
  return agendaService.listarEntradasAgenda(auth.supabase, auth.userId, {
    ...paging,
    from: req.query.from,
    to: req.query.to,
    prospect_id: req.query.prospect_id,
  });
}

export async function crearEntrada(auth, _req, body) {
  return agendaService.crearEntradaAgenda(auth.supabase, auth.userId, body);
}

export async function obtenerEntrada(auth, req) {
  return agendaService.obtenerEntradaAgenda(auth.supabase, auth.userId, req.params.id);
}

export async function actualizarEntrada(auth, req, body) {
  return agendaService.actualizarEntradaAgenda(auth.supabase, auth.userId, req.params.id, body);
}

export async function eliminarEntrada(auth, req) {
  return agendaService.eliminarEntradaAgenda(auth.supabase, auth.userId, req.params.id);
}
