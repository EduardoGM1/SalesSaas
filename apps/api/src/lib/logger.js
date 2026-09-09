/**
 * Logger estructurado (una línea JSON por evento) para PM2/journald.
 *
 * Cada línea incluye el contexto del request (request_id, user_id, tenant_id)
 * tomado de AsyncLocalStorage, sin que el llamador tenga que pasarlo.
 * Campos con nombre sensible (password, token, cookie, authorization, secret,
 * key) se redactan siempre. Los stacks solo salen fuera de producción.
 *
 * Uso: logger.info("sync.pull.ok", { ms }); logger.error(err, { scope: "auth.login" });
 */
import { getRequestContext } from "./request-context.js";

const SENSITIVE_KEY = /(password|passwd|secret|token|cookie|authorization|api[-_]?key|service_role)/i;
const MAX_DEPTH = 4;

function isProd() {
  return process.env.NODE_ENV === "production";
}

function serializeError(err) {
  const out = { name: err.name, message: err.message };
  if (err.code) out.code = err.code;
  if (err.status) out.status = err.status;
  if (!isProd() && err.stack) out.stack = err.stack;
  return out;
}

/** Copia defensiva: redacta claves sensibles, corta ciclos y limita profundidad. */
function sanitize(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (value instanceof Error) return serializeError(value);
  if (typeof value !== "object") return value;
  if (depth >= MAX_DEPTH) return "[depth]";
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : sanitize(v, depth + 1, seen);
  }
  return out;
}

function write(level, msg, extra) {
  const ctx = getRequestContext();
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: msg instanceof Error ? msg.message : String(msg),
    request_id: ctx.requestId ?? null,
    user_id: ctx.userId ?? null,
    tenant_id: ctx.workspaceId ?? null,
  };
  if (msg instanceof Error) line.error = serializeError(msg);
  if (extra && typeof extra === "object") Object.assign(line, sanitize(extra));

  let encoded;
  try {
    encoded = JSON.stringify(line);
  } catch {
    encoded = JSON.stringify({ ts: line.ts, level, msg: line.msg, note: "unserializable extra" });
  }
  if (level === "error") console.error(encoded);
  else if (level === "warn") console.warn(encoded);
  else console.log(encoded);
}

export const logger = {
  info: (msg, extra) => write("info", msg, extra),
  warn: (msg, extra) => write("warn", msg, extra),
  error: (msg, extra) => write("error", msg, extra),
};
