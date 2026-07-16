import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";
import {
  clearUserPlanCache,
  getUserPlanCache,
  setUserPlanCache,
} from "@/lib/user-plan-cache.js";

const EMPTY = {
  plan: "basico",
  status: "activa",
  fecha_inicio: null,
  fecha_proximo_cobro: null,
  premiumFeatures: [],
};

function fromSession(session) {
  if (!session?.profile && !session?.membership) {
    return { ...EMPTY };
  }
  const membership = session.membership || {};
  const profile = session.profile || {};
  return {
    plan: membership.plan || profile.plan || "basico",
    status: membership.status || profile.membership_status || "activa",
    fecha_inicio: membership.fecha_inicio ?? profile.membership_fecha_inicio ?? null,
    fecha_proximo_cobro: membership.fecha_proximo_cobro ?? profile.membership_fecha_proximo_cobro ?? null,
    premiumFeatures: Array.isArray(session.premiumFeatures) ? session.premiumFeatures : [],
  };
}

/**
 * Plan vigente del usuario desde la sesión.
 * `ready`/`loading`: hasta la primera respuesta de sesión no se debe asumir bloqueo.
 */
export function useUserPlan() {
  const [state, setState] = useState(() => {
    const cached = getUserPlanCache();
    if (cached) {
      return { ...cached, ready: true, loading: false };
    }
    return { ...EMPTY, ready: false, loading: true };
  });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setUserPlanCache({ ...EMPTY });
      setState({ ...EMPTY, ready: true, loading: false });
      return undefined;
    }
    return watchSession((session) => {
      if (!session?.profile && !session?.membership) {
        clearUserPlanCache();
        setState({ ...EMPTY, ready: true, loading: false });
        return;
      }
      const next = fromSession(session);
      setUserPlanCache(next);
      setState({ ...next, ready: true, loading: false });
    });
  }, []);

  return state;
}

export { clearUserPlanCache };
