import { apiError } from "../lib/http.js";

/**
 * Rate limiting en memoria con ventana fija, para endpoints sensibles
 * (búsqueda de usuarios, invitaciones). Suficiente para una sola instancia;
 * si la API escala horizontalmente migrar a un store compartido (Redis).
 */
const buckets = new Map();
const MAX_TRACKED_KEYS = 10_000;

function pruneExpired(now) {
  if (buckets.size < MAX_TRACKED_KEYS) return;
  for (const [key, bucket] of buckets) {
    if (now >= bucket.resetAt) buckets.delete(key);
  }
}

export function resetRateLimitStore() {
  buckets.clear();
}

export function rateLimit({
  windowMs = 60_000,
  max = 30,
  name = "default",
  message = "Demasiadas solicitudes. Intenta de nuevo en unos segundos.",
} = {}) {
  return (req, res, next) => {
    const now = Date.now();
    pruneExpired(now);
    const key = `${name}:${req.ip || req.socket?.remoteAddress || "unknown"}`;
    let bucket = buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return apiError(res, message, 429);
    }
    next();
  };
}
