import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { customModulesApi } from "@/lib/custom-modules-api.js";
import { modulesForExtensionPoint } from "@/lib/custom-modules/extension-points.js";
import { useFlags } from "@/hooks/use-flag.js";
import { useWorkspace } from "@/hooks/use-workspace.js";

/**
 * Módulos custom habilitados en el workspace activo (API + filtro por flag de sesión).
 */
export function useCustomModules(punto = null) {
  const { active } = useWorkspace();
  const { flags, hasCatalog } = useFlags();
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const workspaceId = active?.id;
  const isSala = active?.tipo === "sala_de_venta";

  useEffect(() => {
    if (!isSupabaseConfigured() || !isSala || !workspaceId) {
      setModules([]);
      setLoading(false);
      setError("");
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    customModulesApi.listEnabled(punto || undefined)
      .then((rows) => {
        if (cancelled) return;
        const list = Array.isArray(rows) ? rows : [];
        const filtered = hasCatalog
          ? list.filter((m) => !m.clave || flags[m.clave] === true)
          : list;
        setModules(punto ? modulesForExtensionPoint(filtered, punto) : filtered);
      })
      .catch((err) => {
        if (!cancelled) {
          setModules([]);
          setError(err?.message || "No se pudieron cargar módulos custom");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [workspaceId, isSala, punto, hasCatalog, flags]);

  return { modules, loading, error, ready: !loading };
}
