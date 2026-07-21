import { useMemo } from "react";
import { resolveModuloAccess } from "@salesapp/shared/auth/module-access.js";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { useUserPlan } from "@/hooks/use-user-plan.js";

/**
 * Único punto de verdad para herramientas como módulos.
 * Combina: activación por scope + plan + permiso RBAC (si aplica).
 * @param {string} claveModulo survey | vacaciones | worksheet | money_box | analysis
 * @param {{ skipPlan?: boolean, skipPermiso?: boolean }} [opts]
 */
export function useModuloAccess(claveModulo, opts = {}) {
  const { can, keys, profile } = useUserPermissions();
  const { plan, ready, loading } = useUserPlan();
  const skipPlan = opts.skipPlan === true;
  const skipPermiso = opts.skipPermiso === true;

  return useMemo(() => {
    const activeModulos = Array.isArray(profile?.active_modulos) ? profile.active_modulos : [];
    const resolved = resolveModuloAccess({
      clave: claveModulo,
      active_modulos: activeModulos,
      plan: plan || profile?.plan || "basico",
      permission_keys: keys,
      skipPlan,
      skipPermiso,
    });
    return {
      ...resolved,
      loading: Boolean(loading) || !ready,
      ready: Boolean(ready),
      canPermiso: resolved.permisoOk,
      can: (clave) => can(clave),
    };
  }, [claveModulo, can, keys, profile?.active_modulos, profile?.plan, plan, ready, loading, skipPlan, skipPermiso]);
}
