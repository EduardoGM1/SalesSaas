/**
 * Tag estable para OneSignal (web_push_topic / collapse_id ≤ 64).
 * Puro: sin red ni DB.
 */
import { createHash } from "node:crypto";

const MAX_PUSH_TAG_LEN = 64;

/**
 * @param {string} prefix
 * @param {...unknown} parts
 */
export function construirEtiquetaPush(prefix, ...parts) {
  const safePrefix = String(prefix || "n").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 20);
  const raw = parts.map((p) => String(p ?? "")).filter(Boolean).join("-");
  const full = raw ? `${safePrefix}-${raw}` : safePrefix;
  if (full.length <= MAX_PUSH_TAG_LEN) return full;
  const hash = createHash("sha256").update(full).digest("hex").slice(0, 12);
  return `${safePrefix}-${hash}`.slice(0, MAX_PUSH_TAG_LEN);
}

export { MAX_PUSH_TAG_LEN };
