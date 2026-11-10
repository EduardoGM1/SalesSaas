/** Shim legacy: la implementación vive en modulos/sync. */
export {
  applyBlockedStrip,
  canAttemptOutboxNow,
  clearOutboxAck,
  clearOutboxBackoff,
  clearOutboxBlocked,
  getOutboxBlockedCount,
  getOutboxState,
  isOutboxDirty,
  isOutboxOnLegacyKey,
  markOutboxDirty,
  peekOutboxGeneration,
  recordOutboxFailure,
  recordOutboxRejected,
} from "@/modulos/sync/servicios/sync-outbox.js";
