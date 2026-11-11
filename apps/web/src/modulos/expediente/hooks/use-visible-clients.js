import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useDbStore } from "@/stores/db-store";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { filterClientsVisibles } from "../dominio/clientes-visibles.js";
import { getVisibleProspectIds } from "../dominio/visible-prospects-cache.js";

/** Clients del blob filtrados por allowlist de sala (si ya hubo mirror). */
export function useVisibleClients() {
  const clients = useDbStore((s) => s.db.clients, shallow);
  const { active } = useWorkspace();
  const isSala = active?.tipo === "sala_de_venta";
  const workspaceId = active?.id || null;

  return useMemo(() => {
    const remoteIds = isSala ? getVisibleProspectIds(workspaceId) : null;
    return filterClientsVisibles(clients, { isSala, remoteIds });
  }, [clients, isSala, workspaceId]);
}
