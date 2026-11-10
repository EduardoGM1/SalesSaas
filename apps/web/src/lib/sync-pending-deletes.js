/** Shim legacy: la implementación vive en modulos/sync. No editar db-store. */
export {
  emptyPendingDeletes,
  ensurePendingDeletes,
  hasPendingDeletes,
  mergePendingDeletes,
  queuePendingDelete,
  queueToolPendingDelete,
} from "@/modulos/sync/fachada-node.js";
