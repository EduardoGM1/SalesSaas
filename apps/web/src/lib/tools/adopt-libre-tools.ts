import { useDbStore } from "@/stores/db-store";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { isNonEmptyToolBucket, LIBRE_TOOL_IDS, type LibreToolId } from "./tool-bucket-utils";

async function deleteRemoteLibreTool(tool: LibreToolId): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    const qs = new URLSearchParams({ tool, prospect_id: "libre" });
    await fetch(`/api/v1/tool-calculations?${qs}`, {
      method: "DELETE",
      credentials: "include",
    });
  } catch {
    /* sync reconcile también puede limpiar huérfanos */
  }
}

/**
 * Migra datos de calculadoras libres al expediente (no duplica).
 * Limpia `db.libre[tool]` y borra filas `prospect_id IS NULL` en nube.
 */
export function adoptLibreToolsToClient(
  clientId: string,
  options: {
    tools?: LibreToolId[];
    snapshots?: Partial<Record<LibreToolId, Record<string, string | number>>>;
  } = {},
): LibreToolId[] {
  const { getToolBucket, saveToolBucket, clearLibreTool } = useDbStore.getState();
  const toolList = options.tools ?? [...LIBRE_TOOL_IDS];
  const adopted: LibreToolId[] = [];

  for (const tool of toolList) {
    const snapshot = options.snapshots?.[tool];
    const src = snapshot && isNonEmptyToolBucket(snapshot)
      ? { ...snapshot }
      : { ...getToolBucket(tool, "libre") };

    if (!isNonEmptyToolBucket(src)) continue;

    saveToolBucket(tool, "client", src, clientId);
    clearLibreTool(tool);
    adopted.push(tool);
    void deleteRemoteLibreTool(tool);
  }

  return adopted;
}

export function hasLibreToolData(): boolean {
  const { getToolBucket } = useDbStore.getState();
  return LIBRE_TOOL_IDS.some((tool) => isNonEmptyToolBucket(getToolBucket(tool, "libre")));
}
