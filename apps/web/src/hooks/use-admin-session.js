import { useEffect, useState } from "react";

export function useAdminSession() {
  const [state, setState] = useState({ loading: true, session: null, error: null });

  useEffect(() => {
    fetch("/api/v1/admin/me", { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? "No autorizado.");
        }
        return r.json();
      })
      .then((session) => setState({ loading: false, session, error: null }))
      .catch((err) => setState({
        loading: false,
        session: null,
        error: err instanceof Error ? err.message : "Error",
      }));
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
