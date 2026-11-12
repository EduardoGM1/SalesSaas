import { Navigate } from "react-router-dom";
import { useFlags } from "@/hooks/use-flag.js";
import { WORKSHEET_ROYAL_HOLIDAY_FLAG } from "@/lib/auth/tool-flags.js";
import { PermissionsUnavailableNotice } from "@/components/auth/permissions-unavailable-notice.jsx";
import { RouteFallback } from "@/components/layout/route-fallback.jsx";

/**
 * Alineado con requireWorkspaceFlag en sala: null/indeterminado NO abre la ruta.
 * Solo true explícito deja pasar (API ya responde 403 si el flag no está activo).
 */
function flagOn(isEnabled, clave) {
  return isEnabled(clave) === true;
}

/**
 * Bloquea rutas /tools/rh/* y /ops/rh/* si el flag de sesión no está activo.
 * Premanifiesto usa RhPremanifiestoGate (lectura por cualquiera de sus flags).
 * Guard de UI: el backend valida los mismos flags en /api/v1/royal-holiday/*.
 */
export function RhToolFlagGate({ flags = [], children }) {
  const { isEnabled, ready, flagsStatus } = useFlags();

  if (flagsStatus === "unavailable") {
    return <PermissionsUnavailableNotice variant="panel" kind="flags" />;
  }
  if (!ready) return <RouteFallback />;
  if (!flagOn(isEnabled, WORKSHEET_ROYAL_HOLIDAY_FLAG)) {
    return <Navigate to="/tools" replace />;
  }
  if (flags.length > 0 && !flags.some((clave) => flagOn(isEnabled, clave))) {
    return <Navigate to="/tools" replace />;
  }
  return children;
}
