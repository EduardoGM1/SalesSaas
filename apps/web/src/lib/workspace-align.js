/**
 * Realinea el cliente con profiles.workspace_activo_id del servidor
 * cuando otro dispositivo cambió de sala/workspace.
 */
import { fetchSession, notifyAuthChanged } from "@/lib/session-api.js";
import { emptyDatabase } from "@/lib/storage/types";
import { useDbStore } from "@/stores/db-store";
import { runWithoutOutboundSync } from "@/lib/sync-suspend.js";
import { toast } from "@/lib/toast";

const FALLBACK_BRAND = { primary: "#1e5eff", accent: "#0f2044", nombre: "Saletse" };

function applyBrand(brand) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const b = brand || FALLBACK_BRAND;
  const primary = b.primary || FALLBACK_BRAND.primary;
  const accent = b.accent || FALLBACK_BRAND.accent;
  root.style.setProperty("--ws-brand-primary", primary);
  root.style.setProperty("--ws-brand-accent", accent);
  root.style.setProperty("--blue", primary);
  root.style.setProperty("--blue-lt", primary);
  root.style.setProperty("--navy", accent);
  root.style.setProperty("--navy2", accent);
  root.dataset.workspaceBrand = b.nombre || "Saletse";
}

/**
 * @param {string|null|undefined} localWorkspaceId — workspace que cree el SyncProvider
 * @returns {Promise<{
 *   changed: boolean,
 *   workspaceId: string|null,
 *   session: object|null,
 * }>}
 */
export async function alignWorkspaceWithServer(localWorkspaceId) {
  let session = null;
  try {
    session = await fetchSession();
  } catch {
    return { changed: false, workspaceId: localWorkspaceId || null, session: null };
  }
  if (!session?.user?.id) {
    return { changed: false, workspaceId: localWorkspaceId || null, session };
  }

  const remoteId =
    session.workspace_activo_id
    || session.workspace_activo?.id
    || null;
  const localId = localWorkspaceId || null;

  if (!remoteId || !localId || remoteId === localId) {
    return { changed: false, workspaceId: remoteId || localId, session };
  }

  applyBrand(session.workspace_activo?.brand);
  const prevSettings = useDbStore.getState().db?.settings || {};
  runWithoutOutboundSync(() => {
    useDbStore.getState().replaceDb({
      ...emptyDatabase(),
      settings: prevSettings,
    });
  });
  notifyAuthChanged();
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("workspace:changed"));
  }

  const name =
    session.workspace_activo?.nombre
    || session.workspace_activo?.name
    || "otro workspace";
  toast.info(`Workspace actualizado en otro dispositivo: ${name}`);

  return { changed: true, workspaceId: remoteId, session };
}
