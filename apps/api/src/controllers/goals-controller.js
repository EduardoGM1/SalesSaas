/**
 * HTTP de metas. Extrae year/month; la autorización vive en el service.
 */
import * as metasService from "../services/goals-service.js";

export async function listarMetas(auth, req) {
  return metasService.listarMetas(auth.supabase, auth.userId, req.query.year);
}

export async function guardarMeta(auth, _req, body) {
  return metasService.guardarMeta(auth.supabase, auth.userId, body);
}

export async function eliminarMeta(auth, req) {
  return metasService.eliminarMeta(auth.supabase, auth.userId, Number(req.query.year), Number(req.query.month));
}
