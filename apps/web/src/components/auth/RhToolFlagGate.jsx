import { Navigate } from "react-router-dom";
import { useFlags } from "@/hooks/use-flag.js";
import { WORKSHEET_ROYAL_HOLIDAY_FLAG } from "@/lib/auth/tool-flags.js";
import { PermissionsUnavailableNotice } from "@/components/auth/permissions-unavailable-notice.jsx";

/** Misma regla que el hub RH: sin catálogo no ocultar; flag en false sí. */
function flagOn(isEnabled, clave) {
  const value = isEnabled(clave);
  if (value === null || value === undefined) return true;
  return value === true;
}

/**
 * Bloquea rutas /tools/rh/* y /ops/rh/* si el flag de sesión no está activo.
 * Premanifiesto usa RhPremanifiestoGate (lectura por cualquiera de sus flags).
 */
export function RhToolFlagGate({ flags = [], children }) {
  const { isEnabled, ready, flagsStatus } = useFlags();

  if (flagsStatus === "unavailable") {
    return <PermissionsUnavailableNotice variant="panel" kind="flags" />;
  }
  if (!ready) return children;
  if (!flagOn(isEnabled, WORKSHEET_ROYAL_HOLIDAY_FLAG)) {
    return <Navigate to="/tools" replace />;
  }
  if (flags.length > 0 && !flags.some((clave) => flagOn(isEnabled, clave))) {
    return <Navigate to="/tools" replace />;
  }
  return children;
}
