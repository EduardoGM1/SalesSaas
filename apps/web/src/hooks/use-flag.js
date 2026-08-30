import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";

/**
 * Motor único de feature flags (sesión → resolver_session_flags en API).
 * La sesión solo incluye flags estándar + custom de la empresa del workspace activo.
 * Si el catálogo aún no está, `hasCatalog` es false → gates degradan a legacy
 * (salvo flags_status === "unavailable": fail-closed, no legacy).
 */
export function useFlags() {
  const [flags, setFlags] = useState(null);
  const [flagsStatus, setFlagsStatus] = useState("ok");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setFlags({});
      setFlagsStatus("ok");
      setReady(true);
      return undefined;
    }
    return watchSession((session) => {
      const raw = session?.flags ?? session?.profile?.flags;
      setFlags(raw && typeof raw === "object" ? raw : {});
      setFlagsStatus(session?.flags_status || session?.profile?.flags_status || "ok");
      setReady(true);
    });
  }, []);

  const hasCatalog = useMemo(() => {
    if (flagsStatus === "unavailable") return false;
    if (!flags || typeof flags !== "object") return false;
    return Object.keys(flags).length > 0;
  }, [flags, flagsStatus]);

  return {
    flags: flags || {},
    ready,
    flagsStatus,
    /** true si el backend ya devolvió al menos un flag (0051 aplicada). */
    hasCatalog,
    isEnabled: (clave) => {
      if (!clave) return false;
      if (flagsStatus === "unavailable") return false;
      if (!hasCatalog) return null;
      return flags[clave] === true;
    },
  };
}

/**
 * @param {string} clave ej. "survey" | "worksheet.money_box" | "survey.tab.motivaciones"
 * @returns {{ enabled: boolean, loading: boolean, ready: boolean, hasCatalog: boolean, legacy: boolean, flagsStatus: string }}
 */
export function useFlag(clave) {
  const { isEnabled, ready, hasCatalog, flagsStatus } = useFlags();
  const value = isEnabled(clave);
  const legacy = flagsStatus !== "unavailable" && value === null;
  return {
    enabled: value === true,
    loading: !ready,
    ready,
    hasCatalog,
    flagsStatus,
    legacy,
  };
}
