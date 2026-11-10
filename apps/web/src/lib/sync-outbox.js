/** Shim legacy: la implementación vive en modulos/sync. */
export {
  clearOutboxAck,
  getOutboxState,
  isOutboxDirty,
  markOutboxDirty,
  peekOutboxGeneration,
} from "@/modulos/sync/fachada-node.js";
