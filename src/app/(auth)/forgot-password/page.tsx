"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Home } from "lucide-react";
import { requestPasswordReset, type AuthState } from "@/app/auth/actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<AuthState | null, FormData>(requestPasswordReset, null);

  return (
    <div className="auth-card">
      <div className="auth-logo"><Home size={22} /></div>
      <div className="auth-title">Recuperar contraseña</div>
      <div className="auth-sub">Te enviaremos un enlace para restablecer tu contraseña.</div>

      {state?.error && <div className="auth-error">{state.error}</div>}
      {state?.message && <div className="auth-ok">{state.message}</div>}

      {!state?.message && (
        <form action={formAction}>
          <div className="auth-field">
            <label className="field-label">Correo</label>
            <input className="auth-input" type="email" name="email" placeholder="tu@correo.com" required autoComplete="email" />
          </div>
          <button type="submit" className="btn btn-primary btn-full" disabled={pending}>
            {pending ? "Enviando…" : "Enviar enlace"}
          </button>
        </form>
      )}

      <div className="auth-foot"><Link href="/login">Volver al inicio de sesión</Link></div>
    </div>
  );
}
