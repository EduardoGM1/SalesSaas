import { Navigate } from "react-router-dom";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { useModuloAccess } from "@/hooks/use-modulo-access.js";
import { toolPermissionKey } from "@/lib/auth/tool-permissions.js";

const TOOL_TO_MODULO = {
  survey: "survey",
  vacaciones: "vacaciones",
  worksheet: "worksheet",
  analysis: "analysis",
  "money-box": "money_box",
};

/**
 * Bloquea rutas de herramientas si el módulo está off o el permiso resuelto está apagado.
 * Money Box: módulo + plan (sin clave RBAC).
 */
export function ToolPermissionGate({ tool, children }) {
  const { can, profile } = useUserPermissions();
  const clave = toolPermissionKey(tool);
  const moduloClave = TOOL_TO_MODULO[tool] || tool;
  // Money Box: el plan lo maneja PremiumFeatureCard / MoneyBoxPage (modal upgrade).
  const { moduloActivo, allowed: moduloAllowed, loading } = useModuloAccess(moduloClave, {
    skipPlan: tool === "money-box",
    skipPermiso: tool === "money-box",
  });

  if (loading) return children;
  if (!(tool === "money-box" ? moduloActivo : moduloAllowed)) {
    return <Navigate to="/tools" replace />;
  }

  // Money Box: sin clave RBAC
  if (!clave) return children;
  if (!profile || !Array.isArray(profile.permission_keys)) return children;
  if (can(clave)) return children;
  return <Navigate to="/tools" replace />;
}
