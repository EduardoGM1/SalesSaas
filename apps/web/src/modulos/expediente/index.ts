/**
 * Fachada pública — expediente (web).
 * Tramo B: dominio. Tramo A: UI, hooks y acciones. API, sync y db-store fuera.
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
  getOrCreateTabId,
  shouldIgnoreRemoteLock,
  isOwnTabLock,
  isSameUserOtherTab,
} from "./fachada-node.js";

export {
  filterAndSortClients,
  createProspectFromName,
  saveClientEdit,
  deleteClientWithConfirm,
} from "./servicios/acciones-expediente.js";

export {
  scopeClientsForList,
  scopeClientsForDerivedViews,
  scopeCalMonthForDerivedViews,
  filterClientsVisibles,
  filterCalMonthVisibles,
  localIdsToPurgeAfterMirror,
  getVisibleProspectIds,
  setVisibleProspectIds,
  mergeVisibleProspectIds,
} from "./fachada-visibilidad.js";

export { useClientActions } from "./hooks/use-client-actions.js";
export { useExpedienteFolderNav, EXPEDIENTE_TABS, WORKSHEET_RH_SUBS } from "./hooks/use-expediente-folder-nav.js";
export {
  useExpedienteRealtime,
  useExpedienteCollab,
  useFieldLock,
} from "./hooks/use-expediente-realtime.js";
export { useSharedToolSession } from "./hooks/use-shared-tool-session.js";

export { CollabField, collabFieldId } from "./ui/collab-field.jsx";
export { SubTabsDrawer, ClientFolderStrip, ClientFolderSubnav } from "./ui/client-folder-nav.jsx";
export { ExpedientePresenceBar } from "./ui/expediente-presence-bar.jsx";
