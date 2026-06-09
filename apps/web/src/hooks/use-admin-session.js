import { useEffect, useState } from "react";

let cachedAdminSession = null;

export function clearAdminSessionCache() {
  cachedAdminSession = null;
}

export function useAdminSession() {
  const [state, setState] = useState(() => (
    cachedAdminSession
      ? { loading: false, session: cachedAdminSession, error: null }
      : { loading: true, session: null, error: null }
  ));

  useEffect(() => {
    if (cachedAdminSession) return;

    fetch("/api/v1/admin/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? "No autorizado.");
        }
        return r.json();
      })
      .then((session) => {
        cachedAdminSession = session;
        setState({ loading: false, session, error: null });
      })
      .catch((err) => setState({
        loading: false,
        session: null,
        error: err instanceof Error ? err.message : "Error",
      }));
  }, []);

  useEffect(() => {
    const onAuthChanged = () => clearAdminSessionCache();
    window.addEventListener("auth:changed", onAuthChanged);
    return () => window.removeEventListener("auth:changed", onAuthChanged);
  }, []);

  return state;
}

export function useAdminFetch(path, search = "") {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  useEffect(() => {
    setState({ loading: true, data: null, error: null });
    const url = `/api/v1/admin/${path}${search}`;
    fetch(url, { credentials: "include" })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Error al cargar datos.");
        return body.data;
      })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((err) => setState({
        loading: false,
        data: null,
        error: err instanceof Error ? err.message : "Error",
      }));
  }, [path, search]);

  return state;
}
