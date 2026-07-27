import { useMemo } from "react";
import { planMeetsMinimum } from "@/lib/auth/plans.js";
import { useUserPlan } from "@/hooks/use-user-plan.js";
import { useFlag } from "@/hooks/use-flag.js";
import { MONEY_BOX_FLAG } from "@/lib/auth/tool-flags.js";

/**
 * Acceso a funciones premium / Money Box.
 * Preferencia: feature flag `worksheet.money_box`. Fallback: plan PRO (legacy).
 * @param {string} featureKey ej. "money_box"
 */
export function useFeatureAccess(featureKey) {
  const { plan, status, premiumFeatures, ready: planReady, loading: planLoading } = useUserPlan();
  const flagClave = featureKey === "money_box" ? MONEY_BOX_FLAG : featureKey;
  const { enabled, loading: flagLoading, legacy, ready: flagReady } = useFlag(flagClave);

  return useMemo(() => {
    const feature = (premiumFeatures || []).find((f) => f.clave === featureKey) || null;
    const requiredPlan = feature?.plan_minimo || (featureKey ? "pro" : "basico");

    if (!legacy && flagReady) {
      const allowed = enabled;
      const locked = !allowed;
      return {
        allowed,
        locked,
        loading: Boolean(flagLoading),
        ready: true,
        plan,
        status,
        requiredPlan,
        feature,
        via: "flag",
      };
    }

    const ready = planReady;
    const allowed = ready ? planMeetsMinimum(plan, requiredPlan) : false;
    const locked = ready && !allowed;
    return {
      allowed,
      locked,
      loading: Boolean(planLoading) || !ready,
      ready: Boolean(ready),
      plan,
      status,
      requiredPlan,
      feature,
      via: "plan",
    };
  }, [
    featureKey,
    plan,
    status,
    premiumFeatures,
    planReady,
    planLoading,
    enabled,
    flagLoading,
    flagReady,
    legacy,
  ]);
}
