/**
 * Entrada pura de sync para otros módulos.
 * No reexporta sync-api ni sync-table-refresh (arrastran store/React).
 * Los shims de @/lib apuntan a servicios/* concretos.
 */
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
} from "./servicios/sync-outbox.js";

export {
  registerSyncPush,
  unregisterSyncPush,
  requestSyncPush,
} from "./servicios/sync-outbound.js";
export {
  emptyPendingDeletes,
  ensurePendingDeletes,
  hasPendingDeletes,
  mergePendingDeletes,
  queuePendingDelete,
  queueToolPendingDelete,
} from "./servicios/sync-pending-deletes.js";
export {
  registerSyncRefresh,
  unregisterSyncRefresh,
  requestSyncRefresh,
} from "./servicios/sync-refresh.js";
export {
  isOutboundSyncSuspended,
  runWithoutOutboundSync,
} from "./servicios/sync-suspend.js";
export {
  localNeedsOutboundPush,
  mergeSyncDatabases,
} from "./servicios/sync-merge.js";
export {
  livePreviewSettingsEqual,
  pickLivePreviewSettings,
  LIVE_PREVIEW_KEYS,
} from "./servicios/settings-sync.js";
