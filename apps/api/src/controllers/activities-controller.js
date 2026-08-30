/**
 * HTTP de actividades de expediente.
 */
import { parseLimitOffset } from "../lib/http.js";
import * as actividadesService from "../services/activities-service.js";

export async function listarActividades(auth, req) {
  const paging = parseLimitOffset(req.query);
  return actividadesService.listarActividades(auth.supabase, auth.userId, {
    ...paging,
    prospect_id: req.query.prospect_id,
  });
}

export async function crearActividad(auth, _req, body) {
  return actividadesService.crearActividad(auth.supabase, auth.userId, body);
}

export async function obtenerActividad(auth, req) {
  return actividadesService.obtenerActividad(auth.supabase, auth.userId, req.params.id);
}

export async function actualizarActividad(auth, req, body) {
  return actividadesService.actualizarActividad(auth.supabase, auth.userId, req.params.id, body);
}

export async function eliminarActividad(auth, req) {
  return actividadesService.eliminarActividad(auth.supabase, auth.userId, req.params.id);
}
