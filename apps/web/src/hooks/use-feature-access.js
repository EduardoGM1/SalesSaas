import { useMemo } from "react";
import { planMeetsMinimum } from "@/lib/auth/plans.js";
import { useUserPlan } from "@/hooks/use-user-plan.js";

/**
 * Único punto de verdad para desbloquear funciones premium.
 * Mientras `loading`, NO se debe tratar como bloqueado.
 * @param {string} featureKey ej. "money_box"
 */
export function useFeatureAccess(featureKey) {
  const { plan, status, premiumFeatures, ready, loading } = useUserPlan();

  return useMemo(() => {
    const feature = (premiumFeatures || []).find((f) => f.clave === featureKey) || null;
    const requiredPlan = feature?.plan_minimo || (featureKey ? "pro" : "basico");
    const allowed = ready ? planMeetsMinimum(plan, requiredPlan) : false;
    // Solo bloqueado cuando ya confirmamos que no alcanza — nunca mientras carga.
    const locked = ready && !allowed;
    return {
      allowed,
      locked,
      loading: Boolean(loading) || !ready,
      ready: Boolean(ready),
      plan,
      status,
      requiredPlan,
      feature,
    };
  }, [featureKey, plan, status, premiumFeatures, ready, loading]);
}
