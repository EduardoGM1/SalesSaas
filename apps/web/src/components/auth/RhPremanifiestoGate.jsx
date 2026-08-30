import { Navigate } from "react-router-dom";
import { useRhPremanifiestoAccess } from "@/hooks/use-rh-premanifiesto-access.js";
import { PermissionsUnavailableNotice } from "@/components/auth/permissions-unavailable-notice.jsx";

/** Bloquea /ops/rh/premanifiesto si el usuario no tiene lectura al módulo. */
export function RhPremanifiestoGate({ children }) {
  const { ready, canRead, flagsStatus } = useRhPremanifiestoAccess();
  if (flagsStatus === "unavailable") {
    return <PermissionsUnavailableNotice variant="panel" kind="flags" />;
  }
  if (!ready) return children;
  if (!canRead) return <Navigate to="/ops/rh" replace />;
  return children;
}
