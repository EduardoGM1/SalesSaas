import { Navigate } from "react-router-dom";
import { useRhPremanifiestoAccess } from "@/hooks/use-rh-premanifiesto-access.js";
import { PermissionsUnavailableNotice } from "@/components/auth/permissions-unavailable-notice.jsx";
import { RouteFallback } from "@/components/layout/route-fallback.jsx";

/**
 * Bloquea /ops/rh/premanifiesto si el usuario no tiene lectura al módulo.
 * Guard de UI: el backend valida en /api/v1/royal-holiday/premanifiesto*.
 */
export function RhPremanifiestoGate({ children }) {
  const { ready, canRead, flagsStatus } = useRhPremanifiestoAccess();
  if (flagsStatus === "unavailable") {
    return <PermissionsUnavailableNotice variant="panel" kind="flags" />;
  }
  if (!ready) return <RouteFallback />;
  if (!canRead) return <Navigate to="/ops/rh" replace />;
  return children;
}
