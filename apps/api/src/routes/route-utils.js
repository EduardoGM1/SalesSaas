import { authenticateApi } from "../middleware/auth.js";
import { apiError, json, parseBody } from "../lib/http.js";
import { ServiceError } from "../lib/service-error.js";

/** Mensaje genérico en producción para no filtrar detalles internos. */
export function internalErrorMessage(err) {
  const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
  if (isProd) return "Error interno del servidor.";
  return err instanceof Error ? err.message : "Error interno del servidor.";
}

export async function requireAuth(req, res) {
  const auth = await authenticateApi(req, res);
  if (!auth.ok) {
    apiError(res, auth.message, auth.status);
    return null;
  }
  return auth;
}

export function parseJsonBody(req, res) {
  const body = parseBody(req.body);
  if (!body) {
    apiError(res, "Cuerpo JSON inválido.");
    return null;
  }
  return body;
}

export async function runService(res, handler, { successStatus, wrap } = {}) {
  try {
    const result = await handler();
    if (wrap === "ok") return json(res, { ok: true });
    if (wrap === "data") return json(res, { data: result }, successStatus);
    if (wrap === "sync") return json(res, { data: result, syncedAt: new Date().toISOString() }, successStatus);
    return json(res, result, successStatus);
  } catch (err) {
    if (err instanceof ServiceError) return apiError(res, err.message, err.status, err.code);
    console.error("[runService]", err);
    return apiError(res, internalErrorMessage(err), 500);
  }
}

/**
 * Ruta autenticada delgada: auth (+ body JSON opcional) → controlador → runService.
 * El rate limit y otros middleware se declaran en el router, no aquí.
 */
export function rutaAutenticada(manejador, opciones = {}) {
  const { cuerpo = false, ...runOpts } = opciones;
  return async (req, res) => {
    const auth = await requireAuth(req, res);
    if (!auth) return;
    if (cuerpo) {
      const body = parseJsonBody(req, res);
      if (!body) return;
      return runService(res, () => manejador(auth, req, body), runOpts);
    }
    return runService(res, () => manejador(auth, req), runOpts);
  };
}
