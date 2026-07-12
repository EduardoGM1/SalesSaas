import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { ensureAuthSyncBridge, watchSession } from "@/lib/session-api.js";

export function ProtectedRoute({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, ok: !isSupabaseConfigured() });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ loading: false, ok: true });
      return;
    }
    ensureAuthSyncBridge();
    // Revalida al montar, al volver visible/focus, cada 60s y cuando otra ventana (web↔PWA) cierra sesión.
    return watchSession((session) => {
      setState({ loading: false, ok: !!session?.user });
    });
  }, []);

  if (state.loading) return <div className="sales-page">Cargando sesión…</div>;
  if (!state.ok) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}
