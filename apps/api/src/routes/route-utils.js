import { authenticateApi } from "../middleware/auth.js";
import { apiError, json, parseBody } from "../lib/http.js";
import { ServiceError } from "../lib/service-error.js";

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
    if (err instanceof ServiceError) return apiError(res, err.message, err.status);
    throw err;
  }
}
