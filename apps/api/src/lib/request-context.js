/**
 * Contexto por request (AsyncLocalStorage): request_id, user_id y tenant_id.
 *
 * Lo llena `requestContextMiddleware` al inicio; `requireAuth` añade el usuario
 * y `getRequestWorkspaceId`/`getRequestWorkspaceContext` el workspace activo.
 * Lo consumen `logger` (para etiquetar cada línea) y `rateLimit` (clave por
 * tenant además de IP). No debe usarse para decisiones de autorización.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const storage = new AsyncLocalStorage();

/** Acepta `X-Request-Id` del proxy (si es razonable) o genera uno. */
function requestIdFrom(req) {
  const incoming = String(req.headers["x-request-id"] || "").trim();
  return /^[A-Za-z0-9._-]{8,128}$/.test(incoming) ? incoming : randomUUID();
}

export function requestContextMiddleware(req, res, next) {
  const ctx = { requestId: requestIdFrom(req), userId: null, workspaceId: null };
  res.setHeader("X-Request-Id", ctx.requestId);
  storage.run(ctx, () => next());
}

export function getRequestContext() {
  return storage.getStore() || {};
}

export function patchRequestContext(patch) {
  const current = storage.getStore();
  if (!current || !patch) return;
  Object.assign(current, patch);
}
