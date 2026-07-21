import { Navigate } from "react-router-dom";
import { useUserPermissions } from "@/hooks/use-user-permissions.js";
import { toolPermissionKey } from "@/lib/auth/tool-permissions.js";

/**
 * Bloquea rutas de herramientas si el permiso resuelto está apagado.
 * Money Box no usa este gate (capa Plan).
 */
export function ToolPermissionGate({ tool, children }) {
  const { can, profile } = useUserPermissions();
  const clave = toolPermissionKey(tool);

  if (!clave) return children;
  if (!profile || !Array.isArray(profile.permission_keys)) return children;
  if (can(clave)) return children;
  return <Navigate to="/tools" replace />;
}
