import { useMemo } from "react";
import { planMeetsMinimum } from "@/lib/auth/plans.js";
import { useUserPlan } from "@/hooks/use-user-plan.js";

/**
 * Único punto de verdad para desbloquear funciones premium.
 * @param {string} featureKey ej. "money_box"
 */
export function useFeatureAccess(featureKey) {
  const { plan, status, premiumFeatures } = useUserPlan();

  return useMemo(() => {
    const feature = (premiumFeatures || []).find((f) => f.clave === featureKey) || null;
    // Si el catálogo aún no llegó (migración pendiente), money_box exige pro por defecto.
    const requiredPlan = feature?.plan_minimo || (featureKey ? "pro" : "basico");
    const allowed = planMeetsMinimum(plan, requiredPlan);
    return {
      allowed,
      locked: !allowed,
      plan,
      status,
      requiredPlan,
      feature,
    };
  }, [featureKey, plan, status, premiumFeatures]);
}
