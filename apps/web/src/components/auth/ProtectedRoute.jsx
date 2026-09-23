import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isSupabaseConfigured } from "@/lib/supabase/config.js";
import { ensureAuthSyncBridge, watchSession } from "@/lib/session-api.js";
import { hasAuthParamsInUrl } from "@/lib/auth-callback.js";
import { authHandoffPath, isRecoveryAuthUrl, peekAuthIntent } from "@/lib/auth-intent.js";

/**
 * Sin VITE_SUPABASE_URL/ANON_KEY la app corre en modo local (solo dev).
 * En producción eso sería un bypass total del login, así que se bloquea.
 */
const LOCAL_MODE_ALLOWED = import.meta.env.DEV;

function ConfigErrorScreen() {
  return (
    <div className="sales-page" style={{ padding: 24 }}>
      <h1 className="page-title">Configuración inválida</h1>
      <p className="page-sub">
        Este build no tiene configurado el servidor de autenticación. Contacta al administrador.
      </p>
    </div>
  );
}

export function ProtectedRoute({ children }) {
  const location = useLocation();
  const localMode = !isSupabaseConfigured();
  const [state, setState] = useState({ loading: true, ok: localMode && LOCAL_MODE_ALLOWED });

  useEffect(() => {
    if (localMode) {
      setState({ loading: false, ok: LOCAL_MODE_ALLOWED });
      return;
    }
    ensureAuthSyncBridge();
    // Revalida al montar. El bus de sesión (poll ~4s, visibility, auth:resume) es compartido.
    return watchSession((session) => {
      setState({ loading: false, ok: !!session?.user });
    });
  }, [localMode]);

  if (localMode && !LOCAL_MODE_ALLOWED) return <ConfigErrorScreen />;
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
