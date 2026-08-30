/**
 * Recarga el blob CRM namespaced al cambiar de workspace, sin copiar
 * worksheetConfig / moneyBoxConfig / tourTypes de la sala anterior.
 */
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { useDbStore } from "@/stores/db-store";
import { switchWorkspaceStorage } from "@/lib/storage/local-storage-adapter";

export function applyWorkspaceLocalDatabase(nextWorkspaceId) {
  const current = useDbStore.getState().db;
  const next = switchWorkspaceStorage(nextWorkspaceId, current);
  runWithoutOutboundSync(() => {
    useDbStore.getState().replaceDb(next);
  });
  return next;
}
