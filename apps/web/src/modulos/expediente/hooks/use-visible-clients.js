import { useMemo } from "react";
import { shallow } from "zustand/shallow";
import { useDbStore } from "@/stores/db-store";
import { useWorkspace } from "@/hooks/use-workspace.js";
import { scopeClientsForList } from "../servicios/acciones-expediente.js";

/** Clients del blob filtrados por allowlist de sala (si ya hubo mirror). */
export function useVisibleClients() {
  const clients = useDbStore((s) => s.db.clients, shallow);
  const { active } = useWorkspace();
  const isSala = active?.tipo === "sala_de_venta";
  const workspaceId = active?.id || null;

  return useMemo(
    () => scopeClientsForList(clients, { isSala, workspaceId }),
    [clients, isSala, workspaceId],
  );
}
