import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { watchSession } from "@/lib/session-api.js";
import { hasResolvedPermission } from "@salesapp/shared/auth/resolve-permissions.js";

/**
 * Permisos resueltos (rol + overrides) desde la sesión.
 */
export function useUserPermissions() {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setProfile(null);
      return undefined;
    }
    return watchSession((session) => setProfile(session?.profile ?? null));
  }, []);

  const keys = useMemo(() => {
    const list = Array.isArray(profile?.permission_keys) ? profile.permission_keys : [];
    return new Set(list);
  }, [profile?.permission_keys]);

  return {
    keys,
    can: (clave) => {
      if (!profile) return true;
      // Sin catálogo en sesión → compat (no bloquear)
      if (!Array.isArray(profile.permission_keys)) return true;
      return hasResolvedPermission(keys, clave);
    },
    profile,
  };
}
