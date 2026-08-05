/**
 * Outbox durable: sobrevive kill/background de la PWA.
 * Flag en localStorage aparte del blob CRM (sts4_v1).
 */
import { OUTBOX_KEY } from "@/lib/storage/keys";

function readRaw() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRaw(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(state));
  } catch {
    // Quota / private mode: best-effort
  }
}

export function isOutboxDirty() {
  const s = readRaw();
  return !!(s && s.dirty === true);
}

export function getOutboxState() {
  const s = readRaw();
  return {
    dirty: !!(s && s.dirty === true),
    dirtySince: s?.dirtySince ?? null,
    generation: Number(s?.generation) || 0,
    lastAckAt: s?.lastAckAt ?? null,
    reason: s?.reason ?? null,
  };
}

/** Marca pendiente de PUT /sync (persistente). */
export function markOutboxDirty(reason = "mutation") {
  const prev = readRaw() || {};
  const now = Date.now();
  writeRaw({
    dirty: true,
    dirtySince: prev.dirty === true && prev.dirtySince ? prev.dirtySince : now,
    generation: (Number(prev.generation) || 0) + 1,
    lastAckAt: prev.lastAckAt ?? null,
    reason: String(reason || "mutation"),
  });
}

/** Limpia Outbox tras PUT /sync OK. */
export function clearOutboxAck() {
  const prev = readRaw() || {};
  writeRaw({
    dirty: false,
    dirtySince: null,
    generation: Number(prev.generation) || 0,
    lastAckAt: Date.now(),
    reason: null,
  });
}

export function peekOutboxGeneration() {
  return getOutboxState().generation;
}
