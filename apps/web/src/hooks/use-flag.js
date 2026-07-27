import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";

/**
 * Motor único de feature flags (sesión → resolver_flag en API).
 * Si la migración 0051 aún no está, `flags` llega vacío y `readyFlags` es false
 * → los gates deben degradar a legacy (permisos/plan).
 */
export function useFlags() {
  const [flags, setFlags] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setFlags({});
      setReady(true);
      return undefined;
    }
    return watchSession((session) => {
      const raw = session?.flags ?? session?.profile?.flags;
      setFlags(raw && typeof raw === "object" ? raw : {});
      setReady(true);
    });
  }, []);

  const hasCatalog = useMemo(() => {
    if (!flags || typeof flags !== "object") return false;
    return Object.keys(flags).length > 0;
  }, [flags]);

  return {
    flags: flags || {},
    ready,
    /** true si el backend ya devolvió al menos un flag (0051 aplicada). */
    hasCatalog,
    isEnabled: (clave) => {
      if (!clave) return false;
      if (!hasCatalog) return null; // señal de “usar legacy”
      return flags[clave] === true;
    },
  };
}

/**
 * @param {string} clave ej. "survey" | "worksheet.money_box" | "survey.tab.motivaciones"
 * @returns {{ enabled: boolean, loading: boolean, ready: boolean, hasCatalog: boolean, legacy: boolean }}
 */
export function useFlag(clave) {
  const { isEnabled, ready, hasCatalog } = useFlags();
  const value = isEnabled(clave);
  const legacy = value === null;
  return {
    enabled: value === true,
    loading: !ready,
    ready,
    hasCatalog,
    legacy,
  };
}
