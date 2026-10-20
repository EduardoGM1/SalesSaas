/**
 * HTTP de agenda (calendar_entries).
 */
import { parseLimitOffset } from "../../../lib/http.js";
import * as servicioAgenda from "../servicios/entradas-agenda-servicio.js";

export async function listarEntradas(auth, req) {
  const paging = parseLimitOffset(req.query);
  return servicioAgenda.listarEntradasAgenda(auth.supabase, auth.userId, {
    ...paging,
    from: req.query.from,
    to: req.query.to,
    prospect_id: req.query.prospect_id,
  });
}

export async function crearEntrada(auth, _req, body) {
  return servicioAgenda.crearEntradaAgenda(auth.supabase, auth.userId, body);
}

export async function obtenerEntrada(auth, req) {
  return servicioAgenda.obtenerEntradaAgenda(auth.supabase, auth.userId, req.params.id);
}

export async function actualizarEntrada(auth, req, body) {
  return servicioAgenda.actualizarEntradaAgenda(auth.supabase, auth.userId, req.params.id, body);
}

export async function eliminarEntrada(auth, req) {
  return servicioAgenda.eliminarEntradaAgenda(auth.supabase, auth.userId, req.params.id);
}
