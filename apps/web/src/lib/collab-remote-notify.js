/**
 * Toast remoto de apartados: un solo punto de entrada + dedupe fuerte.
 * Evita ecos del propio guardado y callbacks duplicados de Realtime.
 */
import { toast } from "@/lib/toast";

const recent = new Map(); // key -> ts
const localSaves = new Map(); // `${prospectId}:${tool}` -> ts
const TOAST_TTL_MS = 2500;
const LOCAL_SAVE_IGNORE_MS = 4000;

function prune(now) {
  for (const [k, t] of recent) {
    if (now - t > 10_000) recent.delete(k);
  }
  for (const [k, t] of localSaves) {
    if (now - t > 15_000) localSaves.delete(k);
  }
}

/** Marca un guardado local para no mostrar toast del eco Realtime. */
export function markLocalToolSave(prospectId, tool) {
  if (!prospectId || !tool) return;
  localSaves.set(`${prospectId}:${tool}`, Date.now());
}

/** true si este cliente acaba de guardar ese tool (eco Realtime / sync). */
export function wasLocalToolSaveRecent(prospectId, tool, windowMs = LOCAL_SAVE_IGNORE_MS) {
  if (!prospectId || !tool) return false;
  const at = localSaves.get(`${prospectId}:${tool}`);
  return !!(at && Date.now() - at < windowMs);
}

/**
 * @returns {boolean} true si se mostró el toast
 */
export function notifyRemoteSectionUpdated({
  prospectId,
  tool,
  message,
  eventId,
  source = "realtime",
}) {
  if (!tool || !message) return false;
  const now = Date.now();
  prune(now);

  const localKey = `${prospectId}:${tool}`;
  const localAt = localSaves.get(localKey);
  if (localAt && now - localAt < LOCAL_SAVE_IGNORE_MS) {
    console.info("[collab-toast] skip eco propio", { tool, eventId, source, msSinceSave: now - localAt });
    return false;
  }

  // Dedupe por eventId exacto + por ventana por tool
  const idKey = eventId ? `id:${eventId}` : null;
  const windowKey = `win:${prospectId || "?"}:${tool}`;
  if (idKey && recent.has(idKey)) {
    console.info("[collab-toast] skip dup eventId", { tool, eventId, source });
    return false;
  }
  if (recent.has(windowKey) && now - recent.get(windowKey) < TOAST_TTL_MS) {
    console.info("[collab-toast] skip dup window", { tool, eventId, source });
    return false;
  }

  if (idKey) recent.set(idKey, now);
  recent.set(windowKey, now);
  console.info("[collab-toast] show", { tool, eventId, source, at: now });
  toast.success(message);
  return true;
}
