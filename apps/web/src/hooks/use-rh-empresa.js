import { useEffect, useState } from "react";
import { fetchSession, watchSession } from "@/lib/session-api.js";

function idsFromSession(session) {
  const ws = session?.workspace_activo || session?.profile?.workspace_activo;
  return {
    empresaId: ws?.empresa_id || null,
    workspaceId: ws?.id || session?.workspace_activo_id || session?.profile?.workspace_activo_id || null,
  };
}

/** Resuelve empresa_id y workspace_id del workspace activo (RH). */
export function useRhEmpresa() {
  const [empresaId, setEmpresaId] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    return watchSession((session) => {
      const ids = idsFromSession(session);
      setEmpresaId(ids.empresaId);
      setWorkspaceId(ids.workspaceId);
      setReady(true);
    });
  }, []);

  return { empresaId, workspaceId, ready };
}

/** Relee sesión una vez (p. ej. al confirmar si el hook aún no resolvió). */
export async function readRhEmpresaFromSession() {
  const session = await fetchSession();
  return idsFromSession(session);
}
