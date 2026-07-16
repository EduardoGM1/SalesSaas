/** Jerarquía de planes (más alto = más acceso). */
export const PLAN_RANK = {
  basico: 0,
  pro: 1,
};

export function planRank(plan) {
  return PLAN_RANK[String(plan || "basico").toLowerCase()] ?? 0;
}

export function planMeetsMinimum(userPlan, requiredPlan) {
  return planRank(userPlan) >= planRank(requiredPlan);
}
