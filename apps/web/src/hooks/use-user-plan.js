import { useEffect, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";

const DEFAULT = {
  plan: "basico",
  status: "activa",
  fecha_inicio: null,
  fecha_proximo_cobro: null,
  premiumFeatures: [],
};

/**
 * Plan vigente del usuario desde la sesión (refresca en auth:changed / resume).
 */
export function useUserPlan() {
  const [state, setState] = useState(DEFAULT);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState(DEFAULT);
      return undefined;
    }
    return watchSession((session) => {
      if (!session?.profile && !session?.membership) {
        setState(DEFAULT);
        return;
      }
      const membership = session.membership || {};
      const profile = session.profile || {};
      setState({
        plan: membership.plan || profile.plan || "basico",
        status: membership.status || profile.membership_status || "activa",
        fecha_inicio: membership.fecha_inicio ?? profile.membership_fecha_inicio ?? null,
        fecha_proximo_cobro: membership.fecha_proximo_cobro ?? profile.membership_fecha_proximo_cobro ?? null,
        premiumFeatures: Array.isArray(session.premiumFeatures) ? session.premiumFeatures : [],
      });
    });
  }, []);

  return state;
}
