/**
 * HTTP de ventas. El recálculo RH de cancelación queda en el service.
 */
import { parseLimitOffset } from "../lib/http.js";
import * as ventasService from "../services/sales-service.js";

export async function listarVentas(auth, req) {
  const paging = parseLimitOffset(req.query);
  return ventasService.listarVentas(auth.supabase, auth.userId, {
    ...paging,
    prospect_id: req.query.prospect_id,
    from: req.query.from,
    to: req.query.to,
  });
}

export async function crearVenta(auth, _req, body) {
  return ventasService.crearVenta(auth.supabase, auth.userId, body);
}

export async function obtenerVenta(auth, req) {
  return ventasService.obtenerVenta(auth.supabase, auth.userId, req.params.id);
}

export async function actualizarVenta(auth, req, body) {
  return ventasService.actualizarVenta(auth.supabase, auth.userId, req.params.id, body);
}

export async function eliminarVenta(auth, req) {
  return ventasService.eliminarVenta(auth.supabase, auth.userId, req.params.id);
}
