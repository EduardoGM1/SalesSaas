/**
 * Outbox durable: sobrevive kill/background de la PWA.
 * Flag en localStorage aparte del blob CRM, namespaced por workspace
 * (`sts4_outbound_v1:{workspaceId}`) para no empujar mutaciones de una sala a otra.
 *
 * Tramo 2: backoff (failCount / nextAttemptAt) y blocked permanentes.
 */
import { OUTBOX_LEGACY_PENDING_KEY, outboxStorageKey } from "@/lib/storage/keys";
import { getActiveWorkspaceId } from "@/lib/storage/local-storage-adapter";
import {
  canAttemptAt,
  mergeBlocked,
  nextAttemptAtFromFailCount,
  splitRejected,
  stripBlockedFromDb,
} from "../dominio/sync-outbox-policy.js";

function storageKey() {
  const ws = getActiveWorkspaceId();
  return ws ? outboxStorageKey(ws) : OUTBOX_LEGACY_PENDING_KEY;
}

/** True si el outbox activo es la clave legacy (sin workspace). No hacer PUT. */
export function isOutboxOnLegacyKey() {
  return !getActiveWorkspaceId();
}

function readRaw() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeRaw(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(storageKey(), JSON.stringify(state));
  } catch {
    // Quota / private mode: best-effort
  }
}

function normalizeBlocked(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((row) => row && row.id)
    .map((row) => ({
      table: String(row.table || ""),
      id: String(row.id),
      code: String(row.code || ""),
    }));
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
    failCount: Number(s?.failCount) || 0,
    nextAttemptAt: s?.nextAttemptAt ?? null,
    lastErrorCode: s?.lastErrorCode ?? null,
    blocked: normalizeBlocked(s?.blocked),
  };
}

export function getOutboxBlockedCount() {
  return getOutboxState().blocked.length;
}

/**
 * ¿Se puede lanzar PUT ahora?
 * - legacy key → false
 * - si nextAttemptAt está en el futuro → false (backoff)
 */
export function canAttemptOutboxNow(now = Date.now()) {
  if (isOutboxOnLegacyKey()) return false;
  return canAttemptAt(getOutboxState().nextAttemptAt, now);
}

/**
 * Marca pendiente de PUT /sync (persistente).
 * No reinicia backoff ni borra blocked.
 */
export function markOutboxDirty(reason = "mutation") {
  const prev = readRaw() || {};
  const now = Date.now();
  writeRaw({
    dirty: true,
    dirtySince: prev.dirty === true && prev.dirtySince ? prev.dirtySince : now,
    generation: (Number(prev.generation) || 0) + 1,
    lastAckAt: prev.lastAckAt ?? null,
    reason: String(reason || "mutation"),
    failCount: Number(prev.failCount) || 0,
    nextAttemptAt: prev.nextAttemptAt ?? null,
    lastErrorCode: prev.lastErrorCode ?? null,
    blocked: normalizeBlocked(prev.blocked),
  });
}

/** Tras PUT OK sin rechazos permanentes pendientes de reintento. */
export function clearOutboxAck() {
  const prev = readRaw() || {};
  writeRaw({
    dirty: false,
    dirtySince: null,
    generation: Number(prev.generation) || 0,
    lastAckAt: Date.now(),
    reason: null,
    failCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    blocked: normalizeBlocked(prev.blocked),
  });
}

/** Reinicia backoff (workspace/login/build/reintento explícito). Conserva dirty/blocked. */
export function clearOutboxBackoff() {
  const prev = readRaw() || {};
  writeRaw({
    ...prev,
    dirty: !!(prev.dirty === true),
    dirtySince: prev.dirtySince ?? null,
    generation: Number(prev.generation) || 0,
    lastAckAt: prev.lastAckAt ?? null,
    reason: prev.reason ?? null,
    failCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    blocked: normalizeBlocked(prev.blocked),
  });
}

/** Limpia blocked + backoff (p. ej. cambio de workspace ya namespaced; o reintento forzado total). */
export function clearOutboxBlocked() {
  const prev = readRaw() || {};
  writeRaw({
    dirty: !!(prev.dirty === true),
    dirtySince: prev.dirtySince ?? null,
    generation: Number(prev.generation) || 0,
    lastAckAt: prev.lastAckAt ?? null,
    reason: prev.reason ?? null,
    failCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    blocked: [],
  });
}

export function recordOutboxFailure(code, now = Date.now()) {
  const prev = readRaw() || {};
  const failCount = (Number(prev.failCount) || 0) + 1;
  writeRaw({
    dirty: true,
    dirtySince: prev.dirty === true && prev.dirtySince ? prev.dirtySince : now,
    generation: Number(prev.generation) || 0,
    lastAckAt: prev.lastAckAt ?? null,
    reason: prev.reason || "reconcile-error",
    failCount,
    nextAttemptAt: nextAttemptAtFromFailCount(failCount, now),
    lastErrorCode: code != null ? String(code) : prev.lastErrorCode ?? null,
    blocked: normalizeBlocked(prev.blocked),
  });
}

/**
 * Registra rechazos: permanentes → blocked; si hay transient, dirty + backoff.
 * @returns {{ permanent: number, transient: number }}
 */
export function recordOutboxRejected(rejected, now = Date.now()) {
  const { permanent, transient } = splitRejected(rejected);
  const prev = readRaw() || {};
  const blocked = mergeBlocked(normalizeBlocked(prev.blocked), permanent);

  if (transient.length) {
    const failCount = (Number(prev.failCount) || 0) + 1;
    writeRaw({
      dirty: true,
      dirtySince: prev.dirty === true && prev.dirtySince ? prev.dirtySince : now,
      generation: Number(prev.generation) || 0,
      lastAckAt: prev.lastAckAt ?? null,
      reason: "sync-partial-transient",
      failCount,
      nextAttemptAt: nextAttemptAtFromFailCount(failCount, now),
      lastErrorCode: transient[0]?.code || "partial",
      blocked,
    });
  } else {
    writeRaw({
      dirty: false,
      dirtySince: null,
      generation: Number(prev.generation) || 0,
      lastAckAt: Date.now(),
      reason: blocked.length ? "sync-partial-blocked" : null,
      failCount: 0,
      nextAttemptAt: null,
      lastErrorCode: permanent[0]?.code || null,
      blocked,
    });
  }

  return { permanent: permanent.length, transient: transient.length };
}

export function applyBlockedStrip(db) {
  const blocked = getOutboxState().blocked;
  return stripBlockedFromDb(db, blocked);
}

export function peekOutboxGeneration() {
  return getOutboxState().generation;
}
