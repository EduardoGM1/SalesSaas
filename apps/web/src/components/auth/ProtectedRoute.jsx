import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { ensureAuthSyncBridge, watchSession } from "@/lib/session-api.js";
import { hasAuthParamsInUrl } from "@/lib/auth-callback.js";
import { authHandoffPath, isRecoveryAuthUrl, peekAuthIntent } from "@/lib/auth-intent.js";

export function ProtectedRoute({ children }) {
  const location = useLocation();
  const [state, setState] = useState({ loading: true, ok: !isSupabaseConfigured() });

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setState({ loading: false, ok: true });
      return;
    }
    ensureAuthSyncBridge();
    // Revalida al montar, al reabrir la PWA (auth:resume), al focus y cada ~20s en standalone.
    return watchSession((session) => {
      setState({ loading: false, ok: !!session?.user });
    });
  }, []);

  if (state.loading) return <div className="sales-page">Cargando sesión…</div>;
  if (!state.ok) {
    // Si Supabase cae al Site URL (/, /login) con ?code=, NO tirar a /login pelado:
    // se perdería el token y el usuario no puede restablecer la contraseña.
    const params = new URLSearchParams(location.search);
    if (hasAuthParamsInUrl(params)) {
      const recovery = isRecoveryAuthUrl(params) || peekAuthIntent() === "recovery";
      // Sin type ni intent (p. ej. PKCE solo ?code=): asumir recovery si caímos al Site URL
      // desde un recover; el signup confirma vía /auth/callback cuando está allowlisted.
      const handoff = authHandoffPath({
        searchParams: params,
        pathname: recovery || params.get("code") ? "/reset-password" : "/auth/callback",
      });
      return <Navigate to={handoff} replace />;
    }
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return children;
}
