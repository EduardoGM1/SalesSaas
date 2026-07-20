import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

let cachedAdminSession = null;
let fetchInFlight = null;

export function clearAdminSessionCache() {
  cachedAdminSession = null;
}

async function fetchAdminSession() {
  const res = await fetch("/api/v1/admin/me", { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "No autorizado.");
  }
  return res.json();
}

function loadAdminSession({ force = false } = {}) {
  if (!force && cachedAdminSession) {
    return Promise.resolve(cachedAdminSession);
  }
  if (!force && fetchInFlight) return fetchInFlight;

  fetchInFlight = fetchAdminSession()
    .then((session) => {
      cachedAdminSession = session;
      return session;
    })
    .finally(() => {
      fetchInFlight = null;
    });
  return fetchInFlight;
}

/**
 * Sesión del panel admin. Refetch al cambiar auth/permisos (evento o Realtime).
 */
export function useAdminSession() {
  const [state, setState] = useState(() => (
    cachedAdminSession
      ? { loading: false, session: cachedAdminSession, error: null }
      : { loading: true, session: null, error: null }
  ));

  const refresh = useCallback(async ({ force = true } = {}) => {
    if (force) clearAdminSessionCache();
    setState((prev) => ({ ...prev, loading: !prev.session, error: null }));
    try {
      const session = await loadAdminSession({ force: true });
      setState({ loading: false, session, error: null });
      return session;
    } catch (err) {
      cachedAdminSession = null;
      setState({
        loading: false,
        session: null,
        error: err instanceof Error ? err.message : "Error",
      });
      return null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadAdminSession({ force: false })
      .then((session) => {
        if (!cancelled) setState({ loading: false, session, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            session: null,
            error: err instanceof Error ? err.message : "Error",
          });
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Refetch cuando cambia la sesión o se invalidan permisos.
  useEffect(() => {
    const onAuthChanged = () => { void refresh({ force: true }); };
    const onPermsChanged = () => { void refresh({ force: true }); };
    window.addEventListener("auth:changed", onAuthChanged);
    window.addEventListener("admin:permissions-changed", onPermsChanged);
    return () => {
      window.removeEventListener("auth:changed", onAuthChanged);
      window.removeEventListener("admin:permissions-changed", onPermsChanged);
    };
  }, [refresh]);

  // Realtime: perfil, overrides y permisos del rol asignado.
  useEffect(() => {
    if (!isSupabaseConfigured()) return undefined;
    const supabase = createClient();
    let channel = null;
    let alive = true;
    const roleId = state.session?.profile?.role_id || null;

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh({ force: true });
    };
    document.addEventListener("visibilitychange", onVisible);

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!alive || !user?.id) return;

      let ch = supabase
        .channel(`admin-session-perms:${user.id}:${roleId || "none"}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` },
          () => { void refresh({ force: true }); },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "usuario_permisos_override", filter: `usuario_id=eq.${user.id}` },
          () => { void refresh({ force: true }); },
        );

      if (roleId) {
        ch = ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "rol_permisos", filter: `rol_id=eq.${roleId}` },
          () => { void refresh({ force: true }); },
        );
      }

      channel = ch.subscribe();
    })();

    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) supabase.removeChannel(channel);
    };
  }, [refresh, state.session?.profile?.role_id]);

  return { ...state, refresh };
}

export function useAdminFetch(path, search = "") {
  const [state, setState] = useState({ loading: Boolean(path), data: null, error: null });

  useEffect(() => {
    if (!path) {
      setState({ loading: false, data: null, error: null });
      return undefined;
    }
    setState({ loading: true, data: null, error: null });
    const url = `/api/v1/admin/${path}${search}`;
    let cancelled = false;
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Error al cargar datos.");
        return body.data;
      })
      .then((data) => {
        if (!cancelled) setState({ loading: false, data, error: null });
      })
      .catch((err) => {
        if (!cancelled) {
          setState({
            loading: false,
            data: null,
            error: err instanceof Error ? err.message : "Error",
          });
        }
      });
    return () => { cancelled = true; };
  }, [path, search]);

  return state;
}
