/**
 * Fachada pública — expediente (web).
 * Tramo B: dominio puro. UI, API, sync y db-store fuera.
 */
export {
  ensureProspectIdentity,
  clientDisplayName,
  activeClients,
  prospectRowToClient,
  canEditShared,
  canCommentShared,
  canAddToWorkspace,
  noteThrottledWarn,
  WARN_THROTTLE_MS,
} from "./fachada-node.js";
