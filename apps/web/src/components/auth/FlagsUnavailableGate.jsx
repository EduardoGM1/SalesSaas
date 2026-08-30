import { useFlags } from "@/hooks/use-flag.js";
import { PermissionsUnavailableNotice } from "@/components/auth/permissions-unavailable-notice.jsx";

/**
 * RPC de flags de sala caído: panel de reintento, no “no tienes el módulo”.
 */
export function FlagsUnavailableGate({ children, fallback = null }) {
  const { ready, flagsStatus } = useFlags();
  if (!ready) return fallback ?? children;
  if (flagsStatus === "unavailable") {
    return <PermissionsUnavailableNotice variant="panel" kind="flags" />;
  }
  return children;
}
