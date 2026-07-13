/**
 * Compat: re-exporta el transporte unificado.
 * Preferir `@/lib/expediente-realtime.js` y `useExpedienteRealtime`.
 */
export {
  expedienteTopic,
  expedienteDataTopic,
  isExpedienteUuid,
  FIELD_LOCK_TTL_MS,
  subscribeExpedienteRealtime,
  startExpedienteRealtime,
  stopExpedienteRealtime,
  updateExpedienteTrack,
  setFocusedField,
  getMyFocusedField,
  findFieldLocker,
  findSectionLocker,
  getExpedientePeers,
  getFieldLocks,
  startExpedienteCollab,
  stopExpedienteCollab,
  updateExpedienteCollabTrack,
} from "@/lib/expediente-realtime.js";
