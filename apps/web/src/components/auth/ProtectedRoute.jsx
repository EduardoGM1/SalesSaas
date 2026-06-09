import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";

export function ProtectedRoute({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, ok: !isSupabaseConfigured() });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ loading: false, ok: true });
      return;
    }
    let active = true;
    const checkSession = () => {
      setState((prev) => ({ ...prev, loading: true }));
      fetch("/api/v1/auth/session", { credentials: "include" })
        .then((r) => {
          if (active) setState({ loading: false, ok: r.ok });
        })
        .catch(() => {
          if (active) setState({ loading: false, ok: false });
        });
    };
    checkSession();
    const onAuthChanged = () => checkSession();
    window.addEventListener("auth:changed", onAuthChanged);
    return () => {
      active = false;
      window.removeEventListener("auth:changed", onAuthChanged);
    };
  }, []);

  if (state.loading) return <div className="sales-page">Cargando sesión…</div>;
  if (!state.ok) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
