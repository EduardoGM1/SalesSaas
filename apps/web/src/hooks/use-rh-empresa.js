import { useEffect, useState } from "react";
import { fetchSession } from "@/lib/session-api.js";

/** Resuelve empresa_id y workspace_id del workspace activo (RH). */
export function useRhEmpresa() {
  const [empresaId, setEmpresaId] = useState(null);
  const [workspaceId, setWorkspaceId] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await fetchSession();
        const ws = s?.workspace_activo || s?.profile?.workspace_activo;
        if (cancelled) return;
        setEmpresaId(ws?.empresa_id || null);
        setWorkspaceId(ws?.id || s?.workspace_activo_id || s?.profile?.workspace_activo_id || null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { empresaId, workspaceId, ready };
}
