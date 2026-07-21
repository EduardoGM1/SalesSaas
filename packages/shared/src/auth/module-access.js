import { MODULE_CATALOG } from "./permission-catalog.js";

const PLAN_RANK = { basico: 0, pro: 1 };

function planMeetsMinimum(userPlan, requiredPlan) {
  const have = PLAN_RANK[String(userPlan || "basico").toLowerCase()] ?? 0;
  const need = PLAN_RANK[String(requiredPlan || "basico").toLowerCase()] ?? 0;
  return have >= need;
}

/**
 * Precedencia de módulo: usuario > grupo > organización > activo_por_default.
 * El plan (requiere_plan) es requisito adicional, no un override de permiso.
 *
 * @param {{
 *   clave: string,
 *   active_modulos?: { clave: string, activo: boolean, requiere_plan?: string|null }[],
 *   plan?: string,
 *   permission_keys?: string[]|Set<string>,
 *   permission_key?: string|null,
 *   skipPlan?: boolean,
 *   skipPermiso?: boolean,
 * }} input
 */
export function resolveModuloAccess(input = {}) {
  const clave = String(input.clave || "").trim();
  const catalog = MODULE_CATALOG.find((m) => m.clave === clave) || null;
  const row = (input.active_modulos || []).find((m) => m.clave === clave);
  const moduloActivo = row ? row.activo !== false : true;
  const requierePlan = row?.requiere_plan ?? catalog?.requiere_plan ?? null;
  const planOk = input.skipPlan
    ? true
    : (!requierePlan || planMeetsMinimum(input.plan || "basico", requierePlan));

  const permKey = input.permission_key ?? catalog?.permission_key ?? null;
  let permisoOk = true;
  if (!input.skipPermiso && permKey) {
    const keys = input.permission_keys;
    if (keys instanceof Set) permisoOk = keys.has(permKey);
    else if (Array.isArray(keys)) permisoOk = keys.includes(permKey);
  }

  const allowed = moduloActivo && planOk && permisoOk;
  let reason = null;
  if (!moduloActivo) reason = "modulo_off";
  else if (!planOk) reason = "plan";
  else if (!permisoOk) reason = "permiso";

  return {
    clave,
    allowed,
    locked: !allowed,
    moduloActivo,
    planOk,
    permisoOk,
    requierePlan,
    reason,
  };
}

export function isModuloActivo(activeModulos, clave) {
  const row = (activeModulos || []).find((m) => m?.clave === clave);
  if (!row) return true;
  return row.activo !== false;
}
