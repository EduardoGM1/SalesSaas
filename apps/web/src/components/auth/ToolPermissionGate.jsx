import { Navigate } from "react-router-dom";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { useFlag } from "@/hooks/use-flag.js";
import { toolPermissionKey } from "@/lib/auth/tool-permissions.js";
import { toolFlagKey } from "@/lib/auth/tool-flags.js";

/**
 * Bloquea rutas de herramientas según feature flags (0051).
 * Fallback legacy a permission_keys si el catálogo de flags aún no existe.
 * Money Box no usa este gate (useFlag worksheet.money_box).
 */
export function ToolPermissionGate({ tool, children }) {
  const { can, profile } = useUserPermissions();
  const flagKey = toolFlagKey(tool);
  const { enabled, loading, legacy } = useFlag(flagKey || "");

  if (!flagKey) return children;
  if (loading) return children;

  if (!legacy) {
    if (enabled) return children;
    return <Navigate to="/tools" replace />;
  }

  // Legacy: RBAC herramientas:*
  const clave = toolPermissionKey(tool);
  if (!clave) return children;
  if (!profile || !Array.isArray(profile.permission_keys)) return children;
  if (can(clave)) return children;
  return <Navigate to="/tools" replace />;
}
