import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";
import { hasResolvedPermission } from "@salesapp/shared/auth/resolve-permissions.js";

/**
 * Permisos resueltos (rol + overrides) desde la sesión.
 * Si el RPC de sala no respondió, keys=[] y permissionsStatus="unavailable"
 * (fail-closed: can() = false; la UI de reintento es aparte).
 */
export function useUserPermissions() {
  const [profile, setProfile] = useState(null);
  const [permissionsStatus, setPermissionsStatus] = useState("ok");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setProfile(null);
      setPermissionsStatus("ok");
      setReady(true);
      return undefined;
    }
    return watchSession((session) => {
      setProfile(session?.profile ?? null);
      setPermissionsStatus(
        session?.permissions_status
          || session?.profile?.permissions_status
          || "ok",
      );
      setReady(true);
    });
  }, []);

  const keys = useMemo(() => {
    const list = Array.isArray(profile?.permission_keys) ? profile.permission_keys : [];
    return new Set(list);
  }, [profile?.permission_keys]);

  return {
    keys,
    ready,
    permissionsStatus,
    can: (clave) => {
      if (!profile) return true;
      if (permissionsStatus === "unavailable") return false;
      if (!Array.isArray(profile.permission_keys)) return false;
      return hasResolvedPermission(keys, clave);
    },
    profile,
  };
}
