/**
 * Entrada Node (sin UI React): dominio puro de expediente.
 * Tramo B. Sync, outbox, db-store, realtime y API quedan fuera.
 */
export {
  ensureProspectIdentity,
  clientDisplayName,
  activeClients,
} from "./dominio/identidad-prospecto.ts";

export {
  prospectRowToClient,
  canEditShared,
  canCommentShared,
  canAddToWorkspace,
} from "./dominio/prospecto-compartido.ts";

export { noteThrottledWarn, WARN_THROTTLE_MS } from "./dominio/aviso-bloqueo.js";
