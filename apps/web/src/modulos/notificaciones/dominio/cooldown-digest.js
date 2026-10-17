/**
 * Decisión pura de cooldown local (sts4_reminder_digest_at / flush).
 * true = aún en ventana → no disparar.
 */
export function debeRespetarCooldown(ultimaMs, ahoraMs, ventanaMs) {
  const last = Number(ultimaMs || 0);
  const now = Number(ahoraMs);
  const win = Number(ventanaMs);
  if (!Number.isFinite(last) || !Number.isFinite(now) || !Number.isFinite(win)) return false;
  return now - last < win;
}

export const VENTANA_DIGEST_MS = 15 * 60 * 1000;
export const VENTANA_FLUSH_MS = 45_000;
export const CLAVE_DIGEST_LOCAL = "sts4_reminder_digest_at";
export const CLAVE_FLUSH_LOCAL = "sts4_reminder_flush_at";
