"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";
import { Home } from "lucide-react";
import { login, type AuthState } from "@/app/auth/actions";

const QUERY_MSG: Record<string, string> = {
  auth: "No se pudo completar la autenticación. Intenta de nuevo.",
  deactivated: "Tu cuenta fue desactivada. Contacta al administrador.",
  "password-updated": "Contraseña actualizada. Ya puedes iniciar sesión.",
};

export function LoginForm() {
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");
  const queryMessage = searchParams.get("message");
  const [state, formAction, pending] = useActionState<AuthState | null, FormData>(login, null);

  const bannerError = state?.error || (queryError ? QUERY_MSG[queryError] ?? "Error de autenticación." : null);
  const bannerOk = state?.message || (queryMessage ? QUERY_MSG[queryMessage] ?? null : null);

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Iniciar sesión</div>
      <div className="auth-sub">Accede a tu panel de ventas timeshare.</div>

      {bannerError && <div className="auth-error">{bannerError}</div>}
      {bannerOk && <div className="auth-ok">{bannerOk}</div>}

      <form action={formAction}>
        <div className="auth-field">
          <label className="field-label">Correo</label>
          <input className="auth-input" type="email" name="email" placeholder="tu@correo.com" required autoComplete="email" />
        </div>
        <div className="auth-field">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <label className="field-label" style={{ marginBottom: 0 }}>Contraseña</label>
            <Link href="/forgot-password" className="auth-link-sm">¿Olvidaste tu contraseña?</Link>
          </div>
          <input className="auth-input" type="password" name="password" placeholder="••••••••" required autoComplete="current-password" />
        </div>
        <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>

      <div className="auth-foot">¿No tienes cuenta? <Link href="/register">Crear cuenta</Link></div>
    </div>
  );
}
