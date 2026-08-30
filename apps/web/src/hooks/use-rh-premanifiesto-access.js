import { useEffect, useMemo, useState } from "react";
import { useFlags } from "@/hooks/use-flag.js";
import { RH_PREMANIFIESTO_READ_FLAGS, RH_TOOL_FLAGS } from "@/lib/auth/tool-flags.js";
import { fetchSession } from "@/lib/session-api.js";

/** Permisos UI Premanifiesto — alineado con flags de sesión (paridad API). */
export function useRhPremanifiestoAccess() {
  const { isEnabled, ready, hasCatalog, flagsStatus } = useFlags();
  const [userId, setUserId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetchSession().then((s) => {
      if (!cancelled) setUserId(s?.profile?.id || s?.user?.id || null);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return useMemo(() => {
    const flagOn = (clave) => hasCatalog && isEnabled(clave) === true;
    const canRead = RH_PREMANIFIESTO_READ_FLAGS.some((f) => flagOn(f));
    const canMarketing = flagOn(RH_TOOL_FLAGS.premanifiestoMarketing);
    const canOpc = flagOn(RH_TOOL_FLAGS.premanifiestoOpc);
    const canRep = flagOn(RH_TOOL_FLAGS.premanifiestoRep);
    const canCreate = canMarketing || canOpc;
    const readOnly = canRead && !canCreate && !canRep;

    return {
      ready,
      hasCatalog,
      flagsStatus,
      userId,
      canRead,
      canMarketing,
      canOpc,
      canRep,
      canCreate,
      readOnly,
    };
  }, [isEnabled, hasCatalog, ready, flagsStatus, userId]);
}
